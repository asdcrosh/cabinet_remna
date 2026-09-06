export function PlanPurchaseOutcome({
  current,
  isPlanSwitch,
  currentPlanName,
  name,
  unlimitedDuration,
  durationDays,
}: {
  current?: boolean
  isPlanSwitch?: boolean
  currentPlanName?: string | null
  name: string
  unlimitedDuration: boolean
  durationDays: number
}) {
  return (
    <section aria-label="После оплаты" className={`mt-4 rounded-xl border p-3.5 text-sm ${isPlanSwitch ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100' : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200'}`}>
      <h4 className="font-semibold">{isPlanSwitch ? 'Вы меняете тариф' : 'После оплаты'}</h4>
      <p className="mt-1.5 text-xs leading-5">
        {isPlanSwitch
          ? `${currentPlanName ? `Тариф «${currentPlanName}»` : 'Текущий тариф'} заменится на «${name}» после успешной оплаты. Неиспользованные дни не переносятся.`
          : unlimitedDuration
            ? 'Будет подключён бессрочный доступ. Продление не потребуется.'
            : current
              ? `К действующей подписке добавится ${durationDays} дн. Повторная настройка не нужна.`
              : `Подключим доступ на ${durationDays} дн. после успешной оплаты. Инструкция появится в разделе подключения.`}
      </p>
    </section>
  )
}
