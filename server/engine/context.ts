/**
 * Engine Request Context
 *
 * Every engine handler receives an EngineContext that has already been
 * authenticated and scoped to the caller. No storage query inside the engine
 * should ever run without this context — that invariant is what prevents the
 * class of bug where one user's data leaks into another user's response.
 *
 * The context flows through the code; it is NOT global state. If a helper
 * needs to query user data, it must take an EngineContext parameter.
 */
import type { Request } from "express";

/**
 * The narrow, provider-agnostic identity + permission object every engine
 * request is scoped to.
 *
 * - userId:            the authenticated session user (always present)
 * - householdUserIds:  userIds to aggregate over (includes userId; may include
 *                      household members the user is authorised to see)
 * - canWrite:          true when the user has write permissions on household
 *                      financial data (false for view-only financial professionals)
 * - requestId:         correlation ID for log tracing; returned in error responses
 */
export interface EngineContext {
  userId: string;
  householdUserIds: string[];
  canWrite: boolean;
  requestId: string;
}

/**
 * An Express Request that has had an EngineContext attached by the auth
 * middleware. Every engine handler should accept this type.
 */
export interface EngineRequest extends Request {
  engineContext: EngineContext;
}

/**
 * Type guard / helper — throws if the context is missing, which means the
 * route was mounted outside the engine sub-app or the middleware wasn't run.
 * This is a bug-check, not a runtime auth check.
 */
export function requireContext(req: Request): EngineContext {
  const ctx = (req as EngineRequest).engineContext;
  if (!ctx) {
    throw new Error(
      "EngineContext missing — engine routes must be mounted on the engine sub-app"
    );
  }
  return ctx;
}
