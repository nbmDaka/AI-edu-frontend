import { expect, test, type Page } from '@playwright/test'

test.use({ channel: 'chrome' })
// Both viewports share one temporary SQLite database.
test.describe.configure({ mode: 'serial' })

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

async function attempt(page: Page, correctIndices: number[]) {
  await page.goto(`/#/items/${fixture!.test}`)
  await page.getByRole('button', { name: 'Начать тестирование', exact: true }).click()
  const questions = page.locator('.assessment-question')
  for (let index = 0; index < await questions.count(); index++) await questions.nth(index).getByRole('radio', { name: correctIndices.includes(index) ? 'Верный ответ' : 'Неверный ответ', exact: true }).check()
  await page.getByRole('button', { name: 'Отправить ответы', exact: true }).click()
  const saved = page.waitForResponse(response => response.url().endsWith(`/items/${fixture!.test}/attempts/`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Завершить тестирование', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(201)
  const result = await response.json()
  const payload = response.request().postDataJSON()
  expect(payload.request_id).toMatch(/^[0-9a-f-]{36}$/)
  const count = (await (await page.request.get('/api/v1/learning-events/')).json()).count
  const token = (await page.context().cookies()).find(cookie => cookie.name === 'csrftoken')!.value
  const replay = await page.request.post(`/api/v1/items/${fixture!.test}/attempts/`, { headers: { 'X-CSRFToken': token }, data: payload })
  expect(replay.status()).toBe(201)
  expect((await replay.json()).id).toBe(result.id)
  expect((await (await page.request.get('/api/v1/learning-events/')).json()).count).toBe(count)
  return result
}

test('admin configures recommendation links in real lecture and practice editors', async ({ page }) => {
  await page.goto('/#/login')
  await page.getByLabel('Email', { exact: true }).fill('integration-admin@example.test')
  await page.getByLabel('Пароль', { exact: true }).fill('Integration1234!')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/admin/)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [id, key] of [[fixture!.lecture, 'теория'], [fixture!.practice, 'применение']]) {
      await page.goto(`/#/admin/curriculum/items/${id}/edit`)
      await page.getByLabel('Ключи компетенций').fill(` ${key.toUpperCase()} \n${key}`)
      await page.getByRole('button', { name: 'Сохранить связи', exact: true }).click()
      await expect(page.getByText('Связи сохранены', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Ключи компетенций')).toHaveValue(key)
      const item = await (await page.request.get(`/api/v1/items/${id}/`)).json()
      expect(item.competency_keys).toEqual([key])
      expect(item.status).toBe('PUBLISHED')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/adaptive-admin-${item.type}-${width}.png`, fullPage: true })
    }
  }
})

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
    const failed = await attempt(page, [3])
    expect(failed.passed).toBe(true)
    expect(failed.adaptive_result.module_passed).toBe(false)
    expect(failed.adaptive_result.module_completed).toBe(false)
    expect(failed.adaptive_result.recommendations.reference_score).toBe(.5)
    expect(failed.adaptive_result.recommendations.groups.map((group: { competency: string }) => group.competency)).toEqual(['теория', 'применение'])
    expect(failed.adaptive_result.recommendations.groups[0].materials[0].available_item_short_id).toBe(fixture!.lecture)
    await expect(page.getByRole('heading', { name: 'Адресные рекомендации', exact: true })).toBeVisible()
    await expect(page.locator('.targeted-recommendations a')).toHaveCount(2)
    await expect(page.locator('.assessment-result-banner')).toContainText('Тест пройден!')
    await expect(page.getByRole('heading', { name: 'Порог готовности не достигнут', exact: true })).toBeVisible()
    await expect(page.locator('.learning-next-bar')).toHaveCount(0)
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
    const passed = await attempt(page, [0, 1, 2])
    expect(passed.passed).toBe(false)
    expect(passed.adaptive_result.module_passed).toBe(true)
    expect(passed.adaptive_result.module_completed).toBe(true)
    await expect(page.getByText('Модуль освоен', { exact: true })).toBeVisible()
    expect((await page.request.get(`/api/v1/items/${fixture!.next}/`)).status()).toBe(200)
    const later = await attempt(page, [])
    expect(later.adaptive_result.module_passed).toBe(false)
    expect(later.adaptive_result.module_completed).toBe(true)
    const journal = (await (await page.request.get('/api/v1/learning-events/')).json()).results as { kind: string; attempt: number | null; details: Record<string, unknown> }[]
    expect(journal.filter(row => row.kind === 'material_completed')).toHaveLength(2)
    expect(journal.filter(row => row.kind === 'practice_submitted')).toHaveLength(2)
    expect(journal.filter(row => row.kind === 'test_submitted')).toHaveLength(3)
    expect(journal.filter(row => row.kind === 'module_reset').map(row => row.attempt)).toEqual([failed.id])
    expect(journal.filter(row => row.kind === 'module_unlocked').map(row => row.attempt)).toEqual([passed.id])
    await expect(page.getByText('Модуль был освоен ранее. Эта попытка не отменяет завершение.', { exact: true })).toBeVisible()
    await expect(page.locator('.learning-next-bar a')).toHaveAttribute('href', `#/items/${fixture!.next}`)
    expect((await page.request.get(`/api/v1/items/${fixture!.next}/`)).status()).toBe(200)
    await page.goto(`/#/items/${fixture!.test}`)
    await expect(page.locator('.assessment-history button')).toHaveCount(3)
    await expect(page.locator('.assessment-history button').last()).toContainText('Тест пройден!')
    await expect(page.locator('.assessment-history button').last()).toContainText('Порог готовности не достигнут')
    await page.goto('/#/progress')
    await expect(page.getByRole('heading', { name: 'Мой прогресс', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Интеграционный курс', exact: true })).toHaveCount(1)
    await expect(page.locator('.profile-history-row')).toHaveCount(3)
    await expect(page.locator('.profile-history-row').nth(1)).toContainText('Тест не пройден')
    await expect(page.locator('.profile-history-row').nth(1)).toContainText('Порог готовности достигнут')
    await expect(page.getByRole('link', { name: 'Лекция для повторения', exact: true })).toBeVisible()
    await page.locator('details summary').last().click()
    await expect(page.locator('.targeted-recommendations a').first()).toHaveAttribute('href', `#/items/${fixture!.lecture}`)
    await expect(page.getByText('Повторите модуль', { exact: true }).last()).toBeVisible()
    await expect(page.getByText('Состояние сохранено на момент попытки. Текущую доступность смотрите в курсе.', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 390) expect((await page.locator('.profile-history-row .attempt-summary').first().boundingBox())!.width).toBeGreaterThan(250)
    await page.screenshot({ path: `test-results/adaptive-progress-${width}.png`, fullPage: true })
    await page.getByRole('link', { name: 'Каталог', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Каталог', exact: true })).toBeVisible()
    for (const [locale, title] of [['en', 'My progress'], ['kz', 'Менің үлгерімім']]) {
      await page.evaluate(locale => localStorage.setItem('ai-edu-locale', locale), locale)
      await page.goto('/#/progress')
      await page.reload()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
      await expect(page.locator('.profile-history-row')).toHaveCount(3)
      await page.locator('details').last().evaluate((element: HTMLDetailsElement) => { element.open = true })
      await expect(page.getByRole('heading', { name: locale === 'en' ? 'Targeted recommendations' : 'Мақсатты ұсыныстар', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Лекция для повторения', exact: true }).first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/adaptive-progress-${locale}-${width}.png`, fullPage: true })
    }
    expect(errors).toEqual([])
  })
}
