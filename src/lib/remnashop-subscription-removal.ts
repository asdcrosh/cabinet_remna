import { remnashopQuery } from './remnashop-db'

interface RemoveRemnashopSubscriptionInput {
  remnashopUserId: number
  remnawaveUuid: string
}

export async function removeRemnashopSubscription(input: RemoveRemnashopSubscriptionInput) {
  await remnashopQuery(
    `
      UPDATE users AS u
      SET current_subscription_id = NULL,
          updated_at = NOW()
      WHERE u.id = $1
        AND EXISTS (
          SELECT 1
          FROM subscriptions AS current_subscription
          WHERE current_subscription.id = u.current_subscription_id
            AND current_subscription.user_remna_id::text = $2
        )
    `,
    [input.remnashopUserId, input.remnawaveUuid]
  )

  await remnashopQuery(
    `
      UPDATE subscriptions
      SET status = 'DELETED',
          expire_at = LEAST(expire_at, NOW()),
          updated_at = NOW()
      WHERE user_id = $1
        AND user_remna_id::text = $2
        AND status <> 'DELETED'
    `,
    [input.remnashopUserId, input.remnawaveUuid]
  )
}
