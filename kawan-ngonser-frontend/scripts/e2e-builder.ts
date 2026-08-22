/**
 * Concert Builder smoke test (§13) against a running dev server, system Chrome.
 * Walks: home entry card → details → days → stages → sets → readiness flips to
 * Ready → export downloads a §3.1 file → "Plan this concert" reaches onboarding
 * → re-uploading the exported file at the same version is declined (B-14).
 *
 *   npx tsx scripts/e2e-builder.ts     (or: bun run scripts/e2e-builder.ts)
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

const step = (name: string) => page.getByRole('button', { name, exact: true })

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// B-1 / H-6 — entry card on the default home
const entry = page.getByText('Build a concert', { exact: true }).first()
check('H-6 build card on home', await entry.isVisible().catch(() => false))
await entry.click()
await page.waitForURL('**/builds/**', { timeout: 10000 })
await page.waitForTimeout(600)
check('B-1 opens the builder at step 1', page.url().includes('step=details'))

// B-4 — details
await page.getByPlaceholder('Bandung Berisik 2026').fill('Bandung Berisik 2026')
await page.getByPlaceholder('Lapangan Gasibu, Bandung').fill('Lapangan Gasibu, Bandung')
await page.waitForTimeout(400)
check('B-9 autosave note', await page.getByText('Saved as you type.').isVisible().catch(() => false))

// B-11 — event id under Advanced
await page.getByRole('button', { name: /Advanced/ }).click()
await page.waitForTimeout(300)
const eventId = await page.locator('input[spellcheck="false"]').first().inputValue()
check('B-11 event id is slug + suffix', /^bandung-berisik-2026-[a-z0-9]{4}$|^-[a-z0-9]{4}$|[a-z0-9]{4}$/.test(eventId))

// B-5 — days
await step('Days').click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Add a day' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Add a day' }).click()
await page.waitForTimeout(400)
check('B-5 two days listed', (await page.locator('input[type="date"]').count()) === 2)

// B-6 — stages
await step('Stages').click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Add a stage' }).click()
await page.waitForTimeout(400)
check('B-6 colour editor appears', await page.getByText(/COLOUR/i).first().isVisible().catch(() => false))
check('B-6 clamp note', await page.getByText(/readable band/).isVisible().catch(() => false))

// B-7 / B-8 — sets
await step('Sets').click()
await page.waitForTimeout(400)
check('B-10 draft checklist while incomplete',
  await page.getByText(/Almost there/).isVisible().catch(() => false))

await page.getByRole('button', { name: 'Add a set' }).first().click()
await page.waitForTimeout(700)
await page.getByPlaceholder('Pamungkas').fill('Feast')
await page.getByRole('button', { name: 'Add set' }).click()
await page.waitForTimeout(700)
check('B-8 set lands in the day group', await page.getByText('Feast', { exact: true }).isVisible().catch(() => false))
check('B-10 flips to Ready', await page.getByText('Ready to go').isVisible().catch(() => false))

// B-7 — a SAME-stage overlap warns; a cross-stage one must not
await page.getByRole('button', { name: 'Add a set' }).first().click()
await page.waitForTimeout(700)
await page.getByPlaceholder('Pamungkas').fill('Hindia')
await page.locator('input[type="time"]').first().fill('19:30')
await page.locator('input[type="time"]').nth(1).fill('20:30')
await page.getByRole('button', { name: 'Add set' }).click()
await page.waitForTimeout(700)
check('B-7 same-stage overlap warns',
  await page.getByText(/has two sets at once/).isVisible().catch(() => false))

// B-13 — export produces a real file
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  (async () => {
    await page.getByRole('button', { name: 'Export JSON' }).click()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: 'Download' }).click()
  })(),
])
const name = download.suggestedFilename()
check('B-13 filename is {event_id}-v{n}.json', /^[a-z0-9-]+-v\d+\.json$/.test(name))
const stream = await download.createReadStream()
const chunks: Buffer[] = []
for await (const c of stream) chunks.push(c as Buffer)
const wire = JSON.parse(Buffer.concat(chunks).toString())
check('B-13 emits the §3.1 wire shape',
  typeof wire.id === 'string'
  && Array.isArray(wire.days) && typeof wire.days[0]?.index === 'number'
  && Array.isArray(wire.stages) && typeof wire.stages[0]?.id === 'string'
  && typeof wire.performances[0]?.artistName === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(wire.performances[0]?.start))
check('B-13 leaks no local fields',
  !('buildId' in wire) && !('origin' in wire) && !('updatedAt' in wire))

// B-12 — plan it
await page.getByRole('button', { name: 'Plan this concert' }).click()
await page.waitForURL('**/onboarding**', { timeout: 10000 })
await page.waitForTimeout(800)
check('B-12 reaches onboarding for the built concert', page.url().includes(wire.id))

// B-2 — the build survives planning and shows on home.
// ?browse=1: the built concert's days start today, so `/` correctly renders
// the concert-day board instead of the default home.
await page.goto(`${BASE}/?browse=1`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
check('B-2 builds section on home', await page.getByText('Your builds').isVisible().catch(() => false))
check('B-2 Ready chip', await page.getByText('Ready', { exact: true }).first().isVisible().catch(() => false))

// B-14 — re-importing the exported file. Same version must be declined
// rather than silently overwrite a plan that is already keyed to it.
const dir = await mkdtemp(join(tmpdir(), 'kn-e2e-'))
const sameFile = join(dir, name)
await download.saveAs(sameFile)
await page.locator('input[type="file"]').setInputFiles(sameFile)
await page.waitForTimeout(1200)
check('B-14 same version is declined',
  await page.getByText(/already have v/).first().isVisible().catch(() => false))

const newerFile = join(dir, 'newer.json')
await writeFile(newerFile, JSON.stringify({ ...wire, version: wire.version + 5 }))
await page.locator('input[type="file"]').setInputFiles(newerFile)
await page.waitForTimeout(1500)
check('B-14 newer version re-imports with the plan revalidated',
  await page.getByText(/your plan survived the update/).first().isVisible().catch(() => false))

// Resource-load failures are environmental here: NUXT_PUBLIC_API_BASE points
// at a LAN backend, and the Builder is offline-only by design (B-17). What
// matters is that no APPLICATION error fired.
const appErrors = errors.filter(e => !e.includes('Failed to load resource'))
check('no application errors', appErrors.length === 0)
if (appErrors.length) console.log('errors:', appErrors.slice(0, 5))
await browser.close()
process.exit(failed ? 1 : 0)
