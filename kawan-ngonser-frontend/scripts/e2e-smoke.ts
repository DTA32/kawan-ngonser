/**
 * Browser smoke test against a running dev server (bun run dev) using the
 * system Chrome — no browser downloads. Walks: fixture upload → onboarding
 * (day 1, two late picks, clash resolution) → All Set → time-travel to the
 * concert-day board → add a custom event via "Add a break".
 *
 *   bun run scripts/e2e-smoke.ts
 */
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors: string[] = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`))

let failed = false
function check(label: string, ok: boolean) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed = true
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// TR-6 upload → onboarding
await page.locator('input[type="file"]').setInputFiles('tests/fixtures/sounds-project-2026.wire.json')
await page.waitForURL('**/onboarding**', { timeout: 10000 })
await page.waitForTimeout(800)
check('upload redirects to onboarding', true)

// O-1 + O-2
await page.locator('[role="checkbox"]', { hasText: 'Day 1' }).first().click()
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(400)

// O-3: two of the latest sets (upcoming at the 19:02 preset)
const rows = page.locator('[role="checkbox"]')
const n = await rows.count()
check('artist list renders', n > 20)
await rows.nth(n - 1).scrollIntoViewIfNeeded()
await rows.nth(n - 1).click()
await rows.nth(n - 3).click()
await page.getByRole('button', { name: 'Finish' }).click()
await page.waitForTimeout(1000)

// O-4 if the picks clash
if (await page.getByText('Schedule clash!').isVisible().catch(() => false)) {
  await page.locator('[data-slot="content"] button').first().click()
  await page.waitForTimeout(800)
}
check('all-set screen', await page.getByRole('heading', { name: 'All set!' }).isVisible().catch(() => false))
await page.getByRole('button', { name: 'Take me home' }).click()
await page.waitForTimeout(800)

// concert-day board via time travel
await page.goto(`${BASE}/?t=2026-08-07T19:02:00%2B07:00`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
check('concert-day board', await page.getByText('DAY 1 ·').first().isVisible().catch(() => false))

// W-2 custom event via Add a break
const addBreak = page.getByText('Add a break', { exact: true }).first()
check('add-a-break button', await addBreak.isVisible().catch(() => false))
await addBreak.scrollIntoViewIfNeeded()
await addBreak.click()
await page.waitForTimeout(900)
const what = page.getByPlaceholder('e.g. Dinner at the food court')
check('custom-event sheet opens', await what.isVisible().catch(() => false))
await what.fill('Dinner')
await page.getByRole('button', { name: 'Add it' }).click()
await page.waitForTimeout(800)
check('custom event lands in the timetable', await page.getByText('Dinner', { exact: true }).isVisible().catch(() => false))

check('no console errors', errors.length === 0)
if (errors.length) console.log('errors:', errors.slice(0, 5))
await browser.close()
process.exit(failed ? 1 : 0)
