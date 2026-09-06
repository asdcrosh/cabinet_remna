import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

for (const width of [768, 1440, 1920]) {
  test(`колокольчик и панель привязаны к содержимому при ширине ${width}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Размер окна задаётся в сценарии')
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 1000 })
    await login(page, E2E_USERS.admin.email)

    for (const path of [
      '/dashboard',
      '/dashboard/subscription',
      '/dashboard/plans',
      '/dashboard/billing',
      '/dashboard/support',
      '/dashboard/settings',
      '/dashboard/admin/plans',
      '/dashboard/admin/users',
    ]) {
      await page.goto(path)
      const content = page.locator('#dashboard-content')
      await expect(content.getByRole('heading').first()).toBeVisible()
      const bell = page.getByRole('button', { name: /Личные уведомления/ })
      await expect(bell).toBeVisible()
      await expect.poll(async () => {
        const buttonBox = await bell.boundingBox()
        const contentBox = await content.boundingBox()
        if (!buttonBox || !contentBox) return false
        return Math.abs(buttonBox.y - contentBox.y) < 2
          && buttonBox.x >= contentBox.x + contentBox.width + 12
      }).toBe(true)

      await bell.click()
      const panel = page.getByRole('dialog', { name: 'Уведомления', exact: true })
      await expect(panel).toBeVisible()
      await expect(panel).toBeFocused()
      const buttonBox = (await bell.boundingBox())!
      const panelBox = (await panel.boundingBox())!
      expect(Math.abs(panelBox.x + panelBox.width - buttonBox.x - buttonBox.width)).toBeLessThan(2)
      expect(Math.abs(panelBox.y - buttonBox.y - buttonBox.height - 12)).toBeLessThan(2)
      expect(panelBox.x).toBeGreaterThanOrEqual(0)
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width)
      await expectNoHorizontalOverflow(page)
      if (path === '/dashboard/admin/plans') {
        await page.screenshot({ path: testInfo.outputPath(`notifications-${width}.png`), animations: 'disabled' })
      }
      await page.keyboard.press('Escape')
      await expect(panel).toBeHidden()
      await expect(bell).toBeFocused()
    }
  })
}
