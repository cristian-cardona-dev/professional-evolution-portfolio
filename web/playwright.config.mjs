// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser UI gate for the portfolio front end.
 *
 * Two specs live under `tests/visual`:
 *   - `visual.spec.mjs` — full-page screenshot baselines (regression detector)
 *   - `axe.spec.mjs`    — axe-core WCAG 2.2 AA scan in both colour schemes
 *
 * The suite runs against a production build served by `astro preview` on
 * port 4322, never against the dev server: the screenshots must capture the
 * same CSS the deployed site ships. `reuseExistingServer` means a preview you
 * already started is reused instead of rebuilt.
 *
 * Deliberate choices:
 *   - `reducedMotion: 'reduce'` and `colorScheme: 'dark'` are the defaults so
 *     the screenshot baselines are stable; the axe spec flips the scheme per
 *     test with `page.emulateMedia`.
 *   - `deviceScaleFactor: 1` — a HiDPI factor would multiply baseline size for
 *     no extra signal.
 *   - Port 4322 (not 4321) so the harness never fights a manual preview.
 *
 * The screenshot baselines are machine-dependent (system fonts, GPU). They are
 * a *local* regression tool and are intentionally NOT run in CI; CI runs only
 * the DOM-based axe spec (see `.github/workflows/quality.yml`).
 */
const PORT = 4322;
const BASE_PATH = '/professional-evolution-portfolio/';
const BASE_URL = `http://127.0.0.1:${PORT}${BASE_PATH}`;

export default defineConfig({
  testDir: 'tests/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  // A full-page capture of the longest page needs more than the 5 s default
  // expect timeout and more than the 30 s default test timeout to reach two
  // consecutive stable frames; both were raised to keep the gate reliable.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
