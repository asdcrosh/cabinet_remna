import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, login } from './helpers'
import { E2E_USERS } from './test-data'

const tcpTemplateUuid = '11111111-1111-4111-8111-111111111111'
const xhttpTemplateUuid = '22222222-2222-4222-8222-222222222222'

test('суперадмин запускает создание ноды и видит этапы', async ({ page }) => {
  let jobs: unknown[] = []
  await page.route('**/api/admin/nodes/provisioning', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      expect(body).toMatchObject({
        nodeName: 'nl-07',
        serverIp: '1.1.1.1',
        sshPort: 22,
        sshUser: 'root',
        tcpTemplateHostUuid: tcpTemplateUuid,
        xhttpTemplateHostUuid: xhttpTemplateUuid,
      })
      expect(body.sshPassword).toBe('E2e-node-password')
      const now = new Date().toISOString()
      const job = {
        id: 'e2e-node-job',
        nodeName: 'nl-07',
        serverIp: '1.1.1.1',
        sshPort: 22,
        sshUser: 'root',
        domain: 'nl-07.example.com',
        status: 'RUNNING',
        currentStep: 'DNS',
        lastError: null,
        createdAt: now,
        updatedAt: now,
        steps: [
          { key: 'QUEUED', label: 'В очереди', status: 'SUCCEEDED', events: [] },
          {
            key: 'DNS',
            label: 'DNS в Timeweb',
            status: 'RUNNING',
            events: [{ id: 'event-1', level: 'INFO', message: 'Создаю A-запись', createdAt: now }],
          },
        ],
      }
      jobs = [job]
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job }) })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobs,
        configuration: { ready: true, missing: [] },
        templates: {
          tcpTemplateHostUuid: null,
          xhttpTemplateHostUuid: null,
          hosts: [
            { uuid: tcpTemplateUuid, remark: 'TCP template', address: 'tcp.example.com', port: 10443, kind: 'TCP' },
            { uuid: xhttpTemplateUuid, remark: 'Finland reserve', address: 'xhttp.example.com', port: 443, kind: 'XHTTP', isDisabled: true, isHidden: true },
          ],
        },
      }),
    })
  })

  await login(page, E2E_USERS.admin.email)
  await page.goto('/dashboard/admin/nodes')

  await expect(page.getByRole('heading', { name: 'Ноды', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Параметры новой ноды' })).toBeVisible()
  await page.getByLabel('Имя ноды').fill('nl-07')
  await page.getByLabel('IP-адрес').fill('1.1.1.1')
  await page.getByLabel('SSH-пароль').fill('E2e-node-password')
  await page.getByRole('button', { name: 'Выбрать TCP-шаблон' }).click()
  await page.getByRole('searchbox', { name: 'Поиск TCP-шаблона' }).fill('tcp.example.com')
  await page.getByRole('option', { name: /TCP template/ }).click()
  await page.getByRole('button', { name: 'Выбрать XHTTP-шаблон' }).click()
  await page.getByRole('searchbox', { name: 'Поиск XHTTP-шаблона' }).fill('xhttp.example.com')
  const hiddenXhttp = page.getByRole('option', { name: /Finland reserve/ })
  await expect(hiddenXhttp.getByText('скрыт', { exact: true })).toBeVisible()
  await hiddenXhttp.click()
  await expect(page.getByRole('button', { name: 'Создать и настроить ноду' })).toBeEnabled()
  await page.getByRole('button', { name: 'Создать и настроить ноду' }).click()

  await expect(page.getByText('Создание ноды запущено')).toBeVisible()
  await expect(page.getByText('Создаю A-запись')).toBeVisible()
  await expect(page.getByText('nl-07.example.com').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
