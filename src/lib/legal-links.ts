export const legalNavigation = [
  { href: '/offer', label: 'Оферта' },
  { href: '/terms', label: 'Соглашение' },
  { href: '/privacy', label: 'Конфиденциальность' },
  { href: '/consent', label: 'Согласие на ПД' },
  { href: '/refunds', label: 'Возвраты' },
  { href: '/contacts', label: 'Контакты' },
] as const

export type LegalPath = (typeof legalNavigation)[number]['href']
