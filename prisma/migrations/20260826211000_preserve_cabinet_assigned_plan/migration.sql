ALTER TABLE "Subscription"
ADD COLUMN "planManagedByCabinet" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Subscription" AS subscription
SET "planManagedByCabinet" = true
WHERE EXISTS (
  SELECT 1
  FROM "Payment" AS payment
  WHERE payment."subscriptionId" = subscription.id
    AND payment."subscriptionProvisionedAt" IS NOT NULL
);

WITH latest_admin_assignment AS (
  SELECT DISTINCT ON (audit.metadata->>'subscriptionId')
    audit.metadata->>'subscriptionId' AS subscription_id,
    audit.metadata->>'planId' AS plan_id,
    audit."createdAt" AS assigned_at
  FROM "AuditLog" AS audit
  WHERE audit.action = 'ADMIN_PLAN_ASSIGNED'
    AND audit.metadata->>'subscriptionId' IS NOT NULL
    AND audit.metadata->>'planId' IS NOT NULL
  ORDER BY audit.metadata->>'subscriptionId', audit."createdAt" DESC
)
UPDATE "Subscription" AS subscription
SET
  "planId" = assignment.plan_id,
  "planManagedByCabinet" = true
FROM latest_admin_assignment AS assignment
WHERE subscription.id = assignment.subscription_id
  AND EXISTS (
    SELECT 1
    FROM "Plan" AS plan
    WHERE plan.id = assignment.plan_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Payment" AS payment
    WHERE payment."subscriptionId" = subscription.id
      AND payment."subscriptionProvisionedAt" > assignment.assigned_at
  );
