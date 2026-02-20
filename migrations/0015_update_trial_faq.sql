-- Update FAQ about free trial to mention credit card is required
UPDATE "landing_faq"
SET "answer" = 'Yes! All paid plans come with a 14-day free trial. A credit card is required to start your trial, but you won''t be charged until the trial period ends. You can cancel anytime during the trial at no cost.',
    "updated_at" = NOW()::text
WHERE "question" = 'Is there a free trial?';
