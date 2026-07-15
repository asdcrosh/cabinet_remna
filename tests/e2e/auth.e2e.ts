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
