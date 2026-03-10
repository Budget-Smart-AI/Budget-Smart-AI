import Stripe from "stripe";
import { storage } from "./storage";
import { auditLog } from "./audit-logger";

// Initialize Stripe with the secret key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20" as any, // Use stable API version
});

// One-time fee for additional bank accounts
export const EXTRA_BANK_ACCOUNT_PRICE = 500; // $5.00 in cents

/**
 * Create or retrieve a Stripe customer for a user
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await storage.getUser(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // If user already has a Stripe customer ID, return it
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.username,
    metadata: {
      userId: user.id,
      username: user.username,
    },
  });

  // Update user with Stripe customer ID
  await storage.updateUserStripeInfo(userId, {
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

/**
 * Create a checkout session for a subscription
 */
export async function createSubscriptionCheckout(
  userId: string,
  priceId: string,
  planId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  const customerId = await getOrCreateStripeCustomer(userId);

  // Get the plan details to determine trial settings
  const plan = await storage.getLandingPricingPlan(planId);
  const trialDays = plan?.trialDays || 14;
  const requiresCard = plan?.requiresCard !== "false";

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      userId,
      planId,
    },
    subscription_data: {
      metadata: {
        userId,
        planId,
      },
    },
  };

  // Add trial if applicable
  if (trialDays > 0) {
    sessionParams.subscription_data!.trial_period_days = trialDays;

    // If card is required for trial, use trial settings
    if (requiresCard) {
      sessionParams.payment_method_collection = "always";
    } else {
      sessionParams.payment_method_collection = "if_required";
    }
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return session;
}

/**
 * Create a checkout session for a one-time payment (additional bank account)
 */
export async function createOneTimeCheckout(
  userId: string,
  amount: number,
  description: string,
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>
): Promise<Stripe.Checkout.Session> {
  const customerId = await getOrCreateStripeCustomer(userId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: description,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      type: "one_time",
      ...metadata,
    },
  });

  return session;
}

/**
 * Create a billing portal session for customers to manage their subscription
 */
export async function createBillingPortalSession(
  userId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const user = await storage.getUser(userId);
  if (!user?.stripeCustomerId) {
    throw new Error("No Stripe customer found for user");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });

  return session;
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  immediately: boolean = false
): Promise<Stripe.Subscription> {
  if (immediately) {
    return await stripe.subscriptions.cancel(subscriptionId);
  } else {
    // Cancel at period end
    return await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }
}

/**
 * Reactivate a canceled subscription (before period end)
 */
export async function reactivateSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

/**
 * Get subscription details
 */
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.retrieve(subscriptionId);
}

/**
 * Update subscription to a different plan
 */
export async function updateSubscriptionPlan(
  subscriptionId: string,
  newPriceId: string,
  planId: string
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  return await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
    metadata: {
      planId,
    },
    proration_behavior: "create_prorations",
  });
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  console.log(`[Stripe Webhook] Received event: ${event.type} (id=${event.id})`);
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleTrialWillEnd(subscription);
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`Stripe webhook handler error for event ${event.type} (${event.id}):`, err);
    auditLog({
      eventType: "stripe.webhook_handler_error",
      eventCategory: "billing",
      actorId: null,
      actorType: "system",
      targetUserId: null,
      action: "webhook_handler_error",
      outcome: "failure",
      metadata: {
        eventType: event.type,
        eventId: event.id,
        error: err?.message || String(err),
      },
    });
    throw err;
  }
}

/**
 * Handle checkout session completion
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  console.log("[Stripe Webhook] checkout.session.completed received:", JSON.stringify({
    sessionId: session.id,
    customerId: session.customer,
    customerEmail: session.customer_email,
    mode: session.mode,
    subscriptionId: session.subscription,
    paymentStatus: session.payment_status,
    metadata: session.metadata,
  }, null, 2));

  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  if (!userId) {
    console.error("[Stripe Webhook] No userId in checkout session metadata — attempting fallback lookups");

    // Fallback 1: look up user by Stripe customer ID
    if (session.customer) {
      const userByCustomer = await storage.getUserByStripeCustomerId(session.customer as string);
      if (userByCustomer) {
        console.log(`[Stripe Webhook] Found user ${userByCustomer.id} via Stripe customer ID ${session.customer}`);
        await processCheckoutForUser(userByCustomer.id, session, planId);
        return;
      }
      console.warn(`[Stripe Webhook] No user found for Stripe customer ID ${session.customer}`);
    }

    // Fallback 2: look up user by customer email
    let customerEmail = session.customer_email || null;
    if (!customerEmail && session.customer) {
      try {
        const stripeCustomer = await stripe.customers.retrieve(session.customer as string);
        customerEmail = 'email' in stripeCustomer ? stripeCustomer.email : null;
      } catch {
        customerEmail = null;
      }
    }

    if (customerEmail) {
      const userByEmail = await storage.getUserByEmail(customerEmail);
      if (userByEmail) {
        console.log(`[Stripe Webhook] Found user ${userByEmail.id} via customer email ${customerEmail}`);
        await processCheckoutForUser(userByEmail.id, session, planId);
        return;
      }
      console.error(`[Stripe Webhook] No user found for customer email ${customerEmail}`);
    }

    const errMsg = `[Stripe Webhook] Could not find user for session ${session.id} (customer: ${session.customer}, email: ${session.customer_email})`;
    console.error(errMsg);
    auditLog({
      eventType: "stripe.checkout_user_not_found",
      eventCategory: "billing",
      actorId: null,
      actorType: "system",
      targetUserId: null,
      action: "checkout_user_lookup_failed",
      outcome: "failure",
      metadata: { sessionId: session.id, customerId: session.customer, customerEmail: session.customer_email },
    });
    return;
  }

  console.log(`[Stripe Webhook] Processing checkout for userId=${userId} planId=${planId}`);
  await processCheckoutForUser(userId, session, planId);
}

async function processCheckoutForUser(
  userId: string,
  session: Stripe.Checkout.Session,
  planId: string | null | undefined
): Promise<void> {
  if (session.mode === "subscription" && session.subscription) {
    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(session.subscription as string) as any;

    console.log(`[Stripe Webhook] Retrieved subscription ${subscription.id} for user ${userId}: status=${subscription.status}`);

    // If planId is missing from metadata, fall back to looking it up by the Stripe price ID
    let resolvedPlanId = planId || null;
    if (!resolvedPlanId && subscription.items?.data?.[0]?.price?.id) {
      const priceId = subscription.items.data[0].price.id as string;
      console.log(`[Stripe Webhook] No planId in metadata for user ${userId}, looking up plan by price ID ${priceId}`);
      const planByPrice = await storage.getLandingPricingByStripePriceId(priceId);
      if (planByPrice) {
        resolvedPlanId = planByPrice.id;
        console.log(`[Stripe Webhook] Resolved planId ${resolvedPlanId} from price ID ${priceId}`);
      } else {
        console.warn(`[Stripe Webhook] No landing_pricing record found for Stripe price ID ${priceId}`);
      }
    }

    console.log(`[Stripe Webhook] Updating user ${userId} — subscriptionId=${subscription.id} status=${subscription.status} planId=${resolvedPlanId}`);

    const updateResult = await storage.updateUserStripeInfo(userId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionPlanId: resolvedPlanId,
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      subscriptionEndsAt: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    });

    if (updateResult) {
      console.log(`[Stripe Webhook] ✓ Successfully updated NeonDB for user ${userId}: subscriptionStatus=${updateResult.subscriptionStatus} subscriptionPlanId=${updateResult.subscriptionPlanId}`);
    } else {
      console.error(`[Stripe Webhook] ✗ updateUserStripeInfo returned no result for user ${userId} — user may not exist in DB`);
    }

    auditLog({
      eventType: "stripe.checkout_completed",
      eventCategory: "billing",
      actorId: null,
      actorType: "system",
      targetUserId: userId,
      action: "subscription_activated",
      outcome: "success",
      metadata: {
        sessionId: session.id,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        planId: resolvedPlanId,
      },
    });

    console.log(`[Stripe Webhook] ✓ checkout.session.completed fully processed for user ${userId}`);
  } else if (session.mode === "payment") {
    // Handle one-time payment (e.g., additional bank account)
    const type = session.metadata?.type;
    if (type === "bank_account_addon") {
      // This would be handled by a separate function to add bank account slots
      console.log(`[Stripe Webhook] One-time payment completed for user ${userId}: bank account addon`);
    }
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const sub = subscription as any;
  const userId = sub.metadata?.userId;
  const planId = sub.metadata?.planId;

  if (!userId) {
    // Try to find user by customer ID
    const customer = await stripe.customers.retrieve(sub.customer as string);
    if ('metadata' in customer && customer.metadata?.userId) {
      const user = await storage.getUserByStripeCustomerId(sub.customer as string);
      if (user) {
        await storage.updateUserStripeInfo(user.id, {
          stripeSubscriptionId: sub.id,
          subscriptionStatus: sub.status,
          subscriptionPlanId: planId || null,
          trialEndsAt: sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
          subscriptionEndsAt: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        });
      }
    }
    return;
  }

  await storage.updateUserStripeInfo(userId, {
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    subscriptionPlanId: planId || null,
    trialEndsAt: sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null,
    subscriptionEndsAt: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
  });
}

/**
 * Handle subscription deletion
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    const user = await storage.getUserByStripeCustomerId(subscription.customer as string);
    if (user) {
      await storage.updateUserStripeInfo(user.id, {
        subscriptionStatus: "canceled",
        stripeSubscriptionId: null,
        subscriptionEndsAt: new Date().toISOString(),
      });
    }
    return;
  }

  await storage.updateUserStripeInfo(userId, {
    subscriptionStatus: "canceled",
    stripeSubscriptionId: null,
    subscriptionEndsAt: new Date().toISOString(),
  });
}

/**
 * Handle successful invoice payment
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  // Update subscription status if applicable
  const inv = invoice as any;
  if (inv.subscription) {
    const subscription = await stripe.subscriptions.retrieve(inv.subscription as string);
    await handleSubscriptionUpdate(subscription);
  }
}

/**
 * Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const user = await storage.getUserByStripeCustomerId(customerId);

  if (user) {
    await storage.updateUserStripeInfo(user.id, {
      subscriptionStatus: "past_due",
    });

    // TODO: Send email notification about failed payment
    console.log(`Payment failed for user ${user.id}`);
  }
}

/**
 * Handle trial ending soon notification (fired by Stripe ~3 days before trial ends)
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.userId;

  let user = userId ? await storage.getUser(userId) : null;

  if (!user) {
    user = await storage.getUserByStripeCustomerId(subscription.customer as string) || null;
  }

  if (!user) {
    console.warn(`handleTrialWillEnd: could not find user for subscription ${subscription.id}`);
    return;
  }

  console.log(`Trial ending soon for user ${user.id}`);

  // Only send reminder if the user opted in
  if (user.trialEmailReminder !== "true") {
    console.log(`User ${user.id} opted out of trial reminder emails, skipping`);
    return;
  }

  const userEmail = user.email;
  if (!userEmail) {
    console.warn(`User ${user.id} has no email address, cannot send trial reminder`);
    return;
  }

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;
  const trialEndStr = trialEnd
    ? trialEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "soon";

  try {
    const { sendEmailViaPostmark, buildTrialReminderEmail } = await import("./email");
    const fromEmail = process.env.ALERT_EMAIL_FROM || process.env.POSTMARK_FROM_EMAIL;
    if (!fromEmail) {
      console.warn("ALERT_EMAIL_FROM not configured, cannot send trial reminder");
      return;
    }

    const firstName = user.firstName || user.username || "there";
    const { subject, text, html } = buildTrialReminderEmail(firstName, trialEndStr);

    await sendEmailViaPostmark({
      from: fromEmail,
      to: userEmail,
      subject,
      text,
      html,
    });

    console.log(`Trial reminder email sent to user ${user.id} (${userEmail})`);

    auditLog({
      eventType: "stripe.trial_reminder_sent",
      eventCategory: "billing",
      actorId: null,
      actorType: "system",
      targetUserId: user.id,
      action: "trial_reminder_email_sent",
      outcome: "success",
      metadata: { subscriptionId: subscription.id, trialEnd: trialEndStr },
    });
  } catch (err: any) {
    console.error(`Failed to send trial reminder email to user ${user.id}:`, err);
    auditLog({
      eventType: "stripe.trial_reminder_failed",
      eventCategory: "billing",
      actorId: null,
      actorType: "system",
      targetUserId: user.id,
      action: "trial_reminder_email_failed",
      outcome: "failure",
      metadata: { subscriptionId: subscription.id, error: err?.message || String(err) },
    });
  }
}

/**
 * Verify Stripe webhook signature
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
