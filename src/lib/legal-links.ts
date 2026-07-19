export const legalNavigation = [
  { href: '/offer', label: 'Оферта' },
  { href: '/terms', label: 'Соглашение' },
  { href: '/privacy', label: 'Политика ПД' },
  { href: '/consent', label: 'Согласие на ПД' },
  { href: '/refunds', label: 'Возвраты' },
  { href: '/contacts', label: 'Контакты' },
] as const

export type LegalPath = (typeof legalNavigation)[number]['href']
