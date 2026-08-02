-- Legacy installations wrote this action before subscription deletion was
-- replaced with non-destructive disabling. Keep it readable for audit history.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_SUBSCRIPTION_DELETED';
