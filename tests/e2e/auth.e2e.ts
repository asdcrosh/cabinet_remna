import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow } from './helpers'

test('страница входа валидирует реальные неверные данные', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Вход в кабинет' })).toBeVisible()
  await page.getByLabel('Email').fill('missing@example.test')
  await page.locator('#password').fill('WrongPassword123')
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.locator('form').getByRole('alert')).toContainText('Неверный email или пароль')
  await expectNoHorizontalOverflow(page)
})

test('защищённая страница отправляет гостя на вход', async ({ page }) => {
  await page.goto('/dashboard/settings')

  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Вход в кабинет' })).toBeVisible()
})

test('повторная отправка ссылки остаётся заблокирована после перезагрузки', async ({ page }) => {
  await page.route('**/api/auth/forgot-password', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.goto('/forgot-password')

  await page.getByLabel('Email').fill('recover@example.test')
  await page.getByRole('button', { name: 'Отправить ссылку' }).click()
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Обратитесь в поддержку' })).toHaveAttribute('href', '/contacts')

  await page.reload()

  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Отправить ещё раз через/ })).toBeDisabled()
  await expectNoHorizontalOverflow(page)
})

test('новый пароль нужно подтвердить, а успешный сброс объясняет выход из сеансов', async ({ page }) => {
  await page.route('**/api/auth/reset-password', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.goto(`/reset-password?token=${'a'.repeat(32)}`)

  await page.getByLabel('Новый пароль', { exact: true }).fill('Password2')
  await page.getByLabel('Повторите пароль').fill('Password3')
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page.getByText('Пароли не совпадают')).toBeVisible()

  await page.getByLabel('Повторите пароль').fill('Password2')
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()

  await expect(page).toHaveURL(/\/login\?reset=success$/)
  await expect(page.getByRole('status')).toContainText('Все прежние сеансы завершены')
  await expectNoHorizontalOverflow(page)
})
