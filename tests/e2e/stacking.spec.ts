import { test, expect } from "@playwright/test";

// ============================================================================
// UI regression guard — click-capture / stacking.
//
// Origin: the logout dropdown was rendered UNDER page content (the topbar sat in
// a static stacking context, so its z-index:50 menu lost to the page's <main>),
// making «تسجيل الخروج» physically unclickable. It only reproduced on the REAL
// signed-in console — never in isolated component tests — because the bug is an
// interaction between the topbar overlay and each page's content stacking.
//
// This guard reproduces those exact conditions: it loads every console page in
// the real shell, opens the account menu, and does a true click-hit test
// (document.elementFromPoint at the logout link's center). If anything is painted
// over the control, the hit returns the covering element and the test fails —
// catching this whole class of "covered control" regression before it ships.
// ============================================================================

// Every page that renders the Kivo console shell (topbar + ProfileMenu).
const CONSOLE_PAGES = [
  "/dashboard",
  "/orders",
  "/conversations",
  "/customers",
  "/insights",
  "/settings",
];

for (const path of CONSOLE_PAGES) {
  test(`account/logout dropdown is clickable (not covered) on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });

    // Open the account menu (the topbar avatar).
    const trigger = page.getByRole("button", { name: "قائمة الحساب" });
    await expect(trigger, "account-menu trigger should exist in the topbar").toBeVisible();
    await trigger.click();

    // The logout item must be present once the menu is open.
    const logout = page.getByRole("menuitem", { name: "تسجيل الخروج" });
    await expect(logout, "logout item should render when the menu opens").toBeVisible();

    // Real click-hit test: the element at the logout link's center must BE the
    // logout link (or a child of it) — not something painted over it.
    const hit = await logout.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const top = document.elementFromPoint(cx, cy);
      const reaches = el === top || el.contains(top) || (!!top && top.contains(el));
      return {
        reaches,
        coveredBy: reaches
          ? null
          : `${top?.tagName}.${(top?.className?.toString?.() || "").slice(0, 40)} "${(top?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)}"`,
      };
    });

    expect(
      hit.reaches,
      `logout link is covered on ${path} — a click would land on: ${hit.coveredBy}`,
    ).toBe(true);
  });
}
