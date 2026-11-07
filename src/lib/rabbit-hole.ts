// https://rabbit-hole-1.gitbook.io/rabbit-hole-docs/for-devs/deep-links-and-user-flow
const prefix = 'rabbithole://add/'

export function buildRabbitHoleLink(subscriptionUrl: string) {
  return isSubscriptionUrl(subscriptionUrl) ? `${prefix}${subscriptionUrl}` : ''
}

export function extractRabbitHoleSubscription(value: string) {
  if (!value.startsWith(prefix)) return ''
  const subscriptionUrl = value.slice(prefix.length)
  return isSubscriptionUrl(subscriptionUrl) ? subscriptionUrl : ''
}

function isSubscriptionUrl(value: string) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}
