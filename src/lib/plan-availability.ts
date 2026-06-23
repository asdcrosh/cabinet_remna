export type PlanAvailabilityValue = 'ALL' | 'NEW' | 'EXISTING' | 'INVITED' | 'ALLOWED' | 'LINK'

export const planAvailabilityLabels: Record<PlanAvailabilityValue, string> = {
  ALL: 'Для всех',
  NEW: 'Только для новых',
  EXISTING: 'Только для действующих',
  INVITED: 'Только для приглашённых',
  ALLOWED: 'Только для разрешённых',
  LINK: 'Только по ссылке',
}
