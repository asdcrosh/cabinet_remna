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
          tcpTemplateHostUuid: tcpTemplateUuid,
          xhttpTemplateHostUuid: xhttpTemplateUuid,
          hosts: [
            { uuid: tcpTemplateUuid, remark: 'TCP template', address: 'tcp.example.com', port: 10443, kind: 'TCP' },
            { uuid: xhttpTemplateUuid, remark: 'XHTTP template', address: 'xhttp.example.com', port: 443, kind: 'XHTTP' },
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
  await expect(page.getByLabel('UUID TCP-шаблона')).toHaveValue(tcpTemplateUuid)
  await expect(page.getByLabel('UUID XHTTP-шаблона')).toHaveValue(xhttpTemplateUuid)
  await page.getByRole('button', { name: 'Создать и настроить ноду' }).click()

  await expect(page.getByText('Создание ноды запущено')).toBeVisible()
  await expect(page.getByText('Создаю A-запись')).toBeVisible()
  await expect(page.getByText('nl-07.example.com').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
