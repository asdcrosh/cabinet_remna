import { Mail, MessageCircle, Smartphone } from 'lucide-react'

export type BroadcastSegment =
  | 'ALL'
  | 'ACTIVE'
  | 'NO_ACTIVE'
  | 'EXPIRED'
  | 'NEVER_PURCHASED'
  | 'INACTIVE_N_DAYS'

export type BroadcastChannel = 'IN_APP' | 'EMAIL' | 'TELEGRAM'
export type BroadcastStep = 'message' | 'audience' | 'delivery'

export type BroadcastStatsValue = {
  recipients: number
  inApp: number
  telegram: Record<'sent' | 'skipped' | 'duplicate' | 'failed', number>
  email: Record<'sent' | 'skipped' | 'duplicate' | 'failed', number>
}

export type BroadcastHistoryItem = {
  id: string
  title: string
  body: string
  segment: string
  inactiveDays: number | null
  channels: string[]
  actionHref: string | null
  actionLabel: string | null
  actionOpenInTelegram: boolean
  imageUrl: string | null
  recipients: number
  inAppCount: number
  telegramSent: number
  telegramSkipped: number
  telegramDuplicate: number
  telegramFailed: number
  emailSent: number
  emailSkipped: number
  emailDuplicate: number
  emailFailed: number
  limited: boolean
  createdAt: string
  createdBy: string | null
}

export type BroadcastTemplateItem = {
  id?: string
  title: string
  description?: string | null
  segment: BroadcastSegment | string
  inactiveDays?: number | null
  channels: string[]
  actionHref?: string | null
  actionLabel?: string | null
  actionOpenInTelegram?: boolean
  imageUrl?: string | null
  body: string
  createdAt?: string
  updatedAt?: string
}

export const broadcastSegments: Array<{ value: BroadcastSegment; label: string; description: string }> = [
  { value: 'ALL', label: 'Все пользователи', description: 'Вся база кабинета' },
  { value: 'ACTIVE', label: 'Активная подписка', description: 'Есть текущий доступ' },
  { value: 'NO_ACTIVE', label: 'Без подписки', description: 'Нет активного доступа' },
  { value: 'EXPIRED', label: 'Истекла подписка', description: 'Был доступ, сейчас нет' },
  { value: 'NEVER_PURCHASED', label: 'Ни разу не покупали', description: 'Зарегистрированы без покупок' },
  { value: 'INACTIVE_N_DAYS', label: 'Не покупали N дней', description: 'Нет активной подписки, раньше покупали' },
]

export const broadcastChannels: Array<{ value: BroadcastChannel; label: string; icon: typeof Mail }> = [
  { value: 'IN_APP', label: 'Кабинет', icon: Smartphone },
  { value: 'TELEGRAM', label: 'Telegram', icon: MessageCircle },
  { value: 'EMAIL', label: 'Email', icon: Mail },
]

export const broadcastActionPresets = [
  { href: '', label: '', title: 'Без кнопки', description: 'Только сообщение' },
  { href: '/dashboard', label: 'Открыть кабинет', title: 'Главная', description: 'Общий экран кабинета' },
  { href: '/dashboard/subscription', label: 'Открыть подписку', title: 'Подписка', description: 'Доступ, QR и подключение' },
  { href: '/dashboard/plans', label: 'Выбрать тариф', title: 'Тарифы', description: 'Покупка и продление' },
  { href: '/dashboard/referrals', label: 'Пригласить друга', title: 'Рефералы', description: 'Бонусы за приглашения' },
  { href: '/dashboard/support', label: 'Написать в поддержку', title: 'Поддержка', description: 'Чат с оператором' },
]

export const builtInBroadcastTemplates: BroadcastTemplateItem[] = [
  {
    title: 'Подписка скоро закончится',
    description: 'Заблаговременное продление без давления',
    segment: 'ACTIVE',
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard/plans',
    actionLabel: 'Продлить подписку',
    body: '{name}, напоминаем о подписке заранее.\n\nВаш тариф: «{plan}»\nДо окончания: {days_left} дн.\n\nПосле продления доступ продолжит работать без пауз, а подключённые устройства и настройки сохранятся. Ничего добавлять заново не потребуется.\n\nВыберите удобный срок в кабинете. Новый период прибавится к текущему.',
  },
  {
    title: 'Персональное предложение',
    description: 'Возвращает пользователей после долгого перерыва',
    segment: 'INACTIVE_N_DAYS',
    inactiveDays: 45,
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard/plans',
    actionLabel: 'Посмотреть предложение',
    body: '{name}, мы сохранили ваш аккаунт и подготовили персональное предложение на возвращение.\n\nВ кабинете можно выбрать новый срок доступа, применить доступный промокод и сразу получить обновлённую подписку.\n\nЧто останется с вами:\n- привычный аккаунт;\n- история платежей;\n- поддержка и быстрые инструкции;\n- подключение по QR-коду или ссылке.\n\nОткройте тарифы и посмотрите доступные условия.',
  },
  {
    title: 'Первое подключение за несколько минут',
    description: 'Знакомство с сервисом для новых пользователей',
    segment: 'NEVER_PURCHASED',
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard/plans',
    actionLabel: 'Выбрать тариф',
    body: '{name}, ваш кабинет уже готов к первому подключению.\n\nВесь процесс занимает несколько минут:\n1. Выберите подходящий срок доступа.\n2. Оплатите тариф онлайн.\n3. Откройте выданную подписку.\n4. Добавьте VPN в приложение по QR-коду или одной кнопкой.\n\nПосле оплаты не нужно ждать ручной активации: данные для подключения появятся в кабинете автоматически.',
  },
  {
    title: 'Доступ можно восстановить',
    description: 'Возврат после завершения подписки',
    segment: 'EXPIRED',
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard/plans',
    actionLabel: 'Вернуть доступ',
    body: '{name}, срок действия подписки «{plan}» завершился.\n\nАккаунт и история покупок сохранены. Чтобы снова пользоваться VPN, достаточно выбрать тариф и оплатить продление.\n\nПосле оплаты кабинет автоматически обновит доступ. Затем можно открыть раздел подписки и подключиться по прежнему удобным способом: через приложение, QR-код или ссылку.\n\nПовторная регистрация и настройка аккаунта не нужны.',
  },
  {
    title: 'Поделитесь доступом с другом',
    description: 'Полноценное приглашение в реферальную программу',
    segment: 'ACTIVE',
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard/referrals',
    actionLabel: 'Пригласить друга',
    body: '{name}, у вас есть персональная ссылка для приглашения друзей.\n\nКак это работает:\n- отправьте другу свою ссылку;\n- друг зарегистрируется и выберет тариф;\n- после его первой оплаты вам начислят бонусные дни.\n\nПерсональная ссылка:\n{ref_link}\n\nСтатус приглашений и начисленные бонусы всегда видны в кабинете.',
  },
  {
    title: 'Бонус для постоянных пользователей',
    description: 'Тёплая коммуникация с активной аудиторией',
    segment: 'ACTIVE',
    channels: ['IN_APP', 'TELEGRAM'],
    actionHref: '/dashboard/bonus-box',
    actionLabel: 'Открыть бонусы',
    body: '{name}, спасибо, что продолжаете пользоваться тарифом «{plan}».\n\nВ кабинете доступны дополнительные возможности для активных пользователей:\n- подарочный бокс;\n- персональные промокоды;\n- бонусные дни за приглашённых друзей;\n- история полученных наград.\n\nЗагляните в раздел бонусов: возможно, там уже есть доступная попытка или новый подарок.',
  },
  {
    title: 'Поможем с подключением',
    description: 'Полезное сервисное сообщение без продажи',
    segment: 'ALL',
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard/support',
    actionLabel: 'Написать в поддержку',
    body: '{name}, если VPN не подключается или приложение показывает ошибку, не нужно разбираться в одиночку.\n\nНапишите в поддержку и укажите:\n- модель устройства;\n- название приложения;\n- что происходит после нажатия кнопки подключения.\n\nМы проверим подписку и подскажем конкретные шаги. Ответ появится в кабинете, а при привязанном Telegram придёт уведомление.',
  },
  {
    title: 'Для вас подготовлен подарок',
    description: 'Промокод или подарочный доступ с понятной инструкцией',
    segment: 'ALL',
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard/plans',
    actionLabel: 'Использовать подарок',
    body: '{name}, для вашего аккаунта подготовлен подарок.\n\nЕсли вы получили промокод, откройте тарифы, выберите подходящий срок и укажите код перед оплатой. Итоговая стоимость пересчитается сразу.\n\nЕсли подарок уже начислен в кабинет, он будет виден в разделе бонусов или среди доступных промокодов.\n\nПодарки могут иметь ограниченный срок действия, поэтому рекомендуем проверить предложение сейчас.',
  },
  {
    title: 'Кабинет стал удобнее',
    description: 'Анонс обновления продукта для всей базы',
    segment: 'ALL',
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard',
    actionLabel: 'Открыть кабинет',
    body: '{name}, мы выпустили новую версию личного кабинета.\n\nЧто стало удобнее:\n- главная страница показывает состояние подписки и главное действие;\n- тарифы проще сравнивать на телефоне;\n- подключение собрано в понятный пошаговый сценарий;\n- статусы оплаты и выдачи подписки стали нагляднее;\n- навигация работает быстрее и занимает меньше места.\n\nОбновление уже установлено. Просто откройте кабинет и продолжайте пользоваться.',
  },
  {
    title: 'Технические работы завершены',
    description: 'Сообщение после обслуживания или восстановления сервиса',
    segment: 'ALL',
    channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
    actionHref: '/dashboard/subscription',
    actionLabel: 'Проверить подписку',
    body: '{name}, плановые технические работы завершены. Кабинет, оплата и выдача подписок работают в обычном режиме.\n\nЕсли устройство не подключилось автоматически, откройте подписку и обновите её в приложении. Обычно повторная настройка не требуется.\n\nПри сохранении ошибки напишите в поддержку: мы проверим ваш профиль и поможем восстановить подключение.',
  },
  {
    title: 'Проверьте подключение на устройстве',
    description: 'Инструкция активным пользователям после изменений сети',
    segment: 'ACTIVE',
    channels: ['IN_APP', 'TELEGRAM'],
    actionHref: '/dashboard/subscription',
    actionLabel: 'Обновить подключение',
    body: '{name}, для тарифа «{plan}» доступны актуальные параметры подключения.\n\nЧтобы приложение использовало последнюю конфигурацию:\n1. Откройте раздел подписки в кабинете.\n2. Выберите своё приложение.\n3. Нажмите кнопку подключения или обновите подписку внутри приложения.\n\nЕсли текущий профиль работает нормально, дополнительных действий не требуется.',
  },
]

export const broadcastPreviewVariables: Record<string, string> = {
  name: 'Артем',
  email: 'user@example.com',
  days_left: '5',
  plan: 'Стандарт 30 дн.',
  ref_link: 'https://cabinet.example/ref/ABCD',
}
