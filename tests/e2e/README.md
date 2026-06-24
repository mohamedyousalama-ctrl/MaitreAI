# E2E UI guards (Playwright)

Real-browser regression guards that run against the **actual signed-in console**
(the layout where interaction bugs like the logout-dropdown bug actually appear —
isolated component tests miss them).

## What runs

- **`stacking.spec.ts`** — click-capture / stacking guard. Opens the account menu
  on every console page and does a true `document.elementFromPoint` hit-test at
  the «تسجيل الخروج» link's center. Fails if any page content is painted over the
  control (the class of bug where a button is visually present but unclickable).

## Run locally

```bash
# one-time: get a browser (or point PW_CHROME at an existing chromium)
npx playwright install chromium

npm run test:e2e
```

The Playwright config starts the app itself (`next dev` in demo mode — no Supabase
env needed; the console renders from seed data) and tears it down after.

If you already have a dev server on :3100, it's reused. To use a pre-downloaded
browser, set `PW_CHROME=/path/to/chrome`.

## CI

`.github/workflows/ui-stacking.yml` runs this on every PR and on push to `main`,
uploading the Playwright report as an artifact on failure.

## Adding pages/controls

`CONSOLE_PAGES` in `stacking.spec.ts` lists the guarded routes. Add new console
routes there. To guard another overlay (a new modal/drawer/popover), follow the
same pattern: open it, then assert `elementFromPoint` at the control's center
resolves to the control (not a covering element).
