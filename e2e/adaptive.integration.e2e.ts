import { expect, test, type Page } from '@playwright/test'

test.use({ channel: 'chrome' })

// Run only against an explicitly prepared local Django database; no API interception.
const fixture = process.env.AI_EDU_INTEGRATION_FIXTURE ? JSON.parse(process.env.AI_EDU_INTEGRATION_FIXTURE) as { course: string; lecture: string; practice: string; test: string; next: string } : null
test.skip(!fixture, 'Requires a local temporary database and AI_EDU_INTEGRATION_FIXTURE')

async function study(page: Page) {
  await page.goto(`/#/items/${fixture!.lecture}`)
  await expect(page.getByRole('heading', { name: 'Лекция для повторения', exact: true })).toBeVisible()
  await expect.poll(async () => {
    const progress = await (await page.request.get(`/api/v1/courses/${fixture!.course}/progress/`)).json()
    return progress.items[fixture!.lecture]?.is_completed
  }).toBe(true)
  await page.goto(`/#/items/${fixture!.practice}`)
  await page.getByRole('button', { name: 'Начать выполнение', exact: true }).click()
  await page.getByLabel('Отчёт о выполнении').fill('Я проверил учебный пример, сравнил источники и самостоятельно исправил найденные ошибки.')
  await page.getByRole('button', { name: 'Перейти к самопроверке', exact: true }).click()
  for (const box of await page.getByRole('checkbox').all()) await box.check()
  const saved = page.waitForResponse(response => response.url().endsWith(`/items/${fixture!.practice}/practice/`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Завершить работу', exact: true }).click()
  expect((await saved).ok()).toBe(true)
  await expect(page.getByText('Практическая работа завершена', { exact: true }).first()).toBeVisible()
}

async function attempt(page: Page, correct: boolean) {
  await page.goto(`/#/items/${fixture!.test}`)
  await page.getByRole('button', { name: 'Начать тестирование', exact: true }).click()
  for (const radio of await page.getByRole('radio', { name: correct ? 'Верный ответ' : 'Неверный ответ', exact: true }).all()) await radio.check()
  await page.getByRole('button', { name: 'Отправить ответы', exact: true }).click()
  const saved = page.waitForResponse(response => response.url().endsWith(`/items/${fixture!.test}/attempts/`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Завершить тестирование', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(201)
  return response.json()
}

for (const width of [1280, 390]) {
  test(`real adaptive journey at ${width}px`, async ({ page, baseURL }) => {
    test.setTimeout(120000)
    expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/#/login')
    await page.getByLabel('Email', { exact: true }).fill(`integration-${width}@example.test`)
    await page.getByLabel('Пароль', { exact: true }).fill('Integration1234!')
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Мой прогресс', exact: true })).toBeVisible()
    expect((await page.request.get(`/api/v1/items/${fixture!.next}/`)).status()).toBe(403)
    await study(page)
    const failed = await attempt(page, false)
    expect(failed.adaptive_result.module_completed).toBe(false)
    await expect(page.getByRole('heading', { name: 'Результаты по компетенциям' })).toBeVisible()
    await expect(page.locator('.repeat-materials ol a')).toHaveCount(2)
    await page.screenshot({ path: `test-results/adaptive-failed-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Пройти ещё раз', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/adaptive-review-links-${width}.png`, fullPage: true })
    expect((await page.request.get(`/api/v1/items/${fixture!.next}/`)).status()).toBe(403)
    const progress = await (await page.request.get(`/api/v1/courses/${fixture!.course}/progress/`)).json()
    expect(progress.items[fixture!.lecture].is_completed).toBe(false)
    expect(progress.items[fixture!.practice].is_completed).toBe(false)
    // The backend must reject skipping the required repetition and preserve attempt history.
    const token = (await page.context().cookies()).find(cookie => cookie.name === 'csrftoken')!.value
    const rejected = await page.request.post(`/api/v1/items/${fixture!.test}/attempts/`, { headers: { 'X-CSRFToken': token }, data: { answers: failed.answers } })
    expect(rejected.status()).toBe(400)
    await study(page)
    const passed = await attempt(page, true)
    expect(passed.adaptive_result.module_completed).toBe(true)
    await expect(page.getByRole('heading', { name: 'Модуль освоен', exact: true })).toBeVisible()
    expect((await page.request.get(`/api/v1/items/${fixture!.next}/`)).status()).toBe(200)
    await page.goto('/#/progress')
    await expect(page.getByRole('heading', { name: 'Мой прогресс', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Интеграционный курс', exact: true })).toHaveCount(1)
    await expect(page.locator('.profile-history-row')).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'Лекция для повторения', exact: true })).toBeVisible()
    await page.locator('details summary').last().click()
    await expect(page.getByRole('heading', { name: 'Повторите модуль', exact: true })).toBeVisible()
    await expect(page.locator('.competency-results li').first()).toContainText('0%')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/adaptive-progress-${width}.png`, fullPage: true })
    await page.getByRole('link', { name: 'Каталог', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Каталог', exact: true })).toBeVisible()
    for (const [locale, title] of [['en', 'My progress'], ['kz', 'Менің үлгерімім']]) {
      await page.evaluate(locale => localStorage.setItem('ai-edu-locale', locale), locale)
      await page.goto('/#/progress')
      await page.reload()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Лекция для повторения', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/adaptive-progress-${locale}-${width}.png`, fullPage: true })
    }
    expect(errors).toEqual([])
  })
}
