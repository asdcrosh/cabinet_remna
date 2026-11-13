'use client'
import { useState } from 'react'
import Image from 'next/image'
import { buildRichScreen, botScreens, type BotScreen } from '@/lib/miniapp/rich-screens'
import { miniAppDemo } from '@/lib/miniapp/model'
import './bot-preview.css'

export function BotPreview() {
  const [screen, setScreen] = useState<BotScreen>('home')
  const [notice, setNotice] = useState('')
  const html = buildRichScreen({ screen, overview: miniAppDemo, appUrl: 'https://cabinet.alekseevvp.site/miniapp',
    devices: [{ id: 'demo-dev-1', title: 'iPhone', platform: 'iOS · Rabbit Hole' }, { id: 'demo-dev-2', title: 'MacBook', platform: 'macOS · Rabbit Hole' }],
    tickets: [{ subject: 'Подключение на iPhone', status: 'Есть ответ' }],
    payments: [{ title: 'AlekseevVP', amount: '299 ₽', status: 'Оплачен', date: '01.11.2026' }, { title: 'AlekseevVP', amount: '299 ₽', status: 'Оплачен', date: '01.10.2026' }],
    autoRenewal: 'включено · MIR **1234',
    bonus: { enabled: true, attempts: 2 },
    inbox: { unread: 2, items: [{ title: 'Подписка продлена на 30 дней', date: '01.11.2026', fresh: true }, { title: 'Новый ответ поддержки', date: '28.10.2026', fresh: false }] },
    prefs: { telegram: true, email: true, broadcasts: false },
    referral: { url: 'https://t.me/alekseevVP_bot?start=ref_DEMO01', condition: 'Новый пользователь приходит по приглашению и вступает в канал. Канал и количество бонусных дней ещё не настроены.', invited: 3, claimed: 1, channelUrl: null, eligible: false, ownClaimed: false }, notice,
  })
  return <main className="bot-preview"><aside><b>AlekseevVP</b><h1>Один сервис.<br />Весь Telegram.</h1><p>Предпросмотр оформления сообщений. Кнопки переключают экраны с вымышленными данными.</p><p>Telegram сам задаёт шрифты и цвета элементов. Реальное отображение нужно проверить в клиенте.</p><a href="/miniapp/preview">Открыть Mini App</a></aside>
    <section className="chat-frame"><header><span className="chat-avatar">A</span><div><b>AlekseevVP</b><small>бот · демонстрация</small></div></header>
      <div className="chat-body"><div className="chat-date">Предпросмотр</div><article className="rich-bubble"><Image className="rich-banner" src="/miniapp/banner.png" alt="AlekseevVP. Ваш интернет. Ваши правила." width={1200} height={450} />
        <div className="rich-body" onClick={event => {
          const button = (event.target as HTMLElement).closest('tg-button')
          if (!button) return
          event.preventDefault()
          const action = button.getAttribute('data')?.replace(/^avp:/, '')
          if (action && botScreens.includes(action as BotScreen)) { setScreen(action as BotScreen); setNotice('') }
          else setNotice('Демонстрация: действие не выполняется. В рабочем боте используются данные вашего кабинета.')
        }} dangerouslySetInnerHTML={{ __html: html }} />
      </article></div>
      <div className="chat-composer">Сообщение…</div><nav className="chat-keyboard" aria-label="Меню бота">{[['subscription','Моя подписка'],['plans','Тарифы'],['billing','Платежи'],['devices','Мои устройства'],['bonus','Бонусы'],['notifications','Уведомления'],['settings','Настройки'],['referrals','Пригласить друга'],['support','Поддержка']].map(([id,label]) => <button key={id} onClick={() => { setScreen(id as BotScreen); setNotice('') }}>{label}</button>)}</nav>
    </section></main>
}
