import { test, expect, type Page } from "@playwright/test";

// ============================================================================
// Onboarding wizard — happy-path guard.
//
// Drives the full 5-step setup the way a real restaurant would, in the real
// signed-in layout. The wizard is "truth-system" gated: each step only advances
// on a real API success, so this test MOCKS the onboarding endpoints (front-end
// guard only — the real endpoints are validated separately against a backend).
// What this protects: the wizard's flow, validation, step gating, the WhatsApp
// skip path, and the final go-live screen — so a regression that strands a step,
// breaks a transition, or drops the go-live confirmation is caught before ship.
// ============================================================================

// Mock every onboarding endpoint with a realistic success payload.
async function mockOnboardingApis(page: Page) {
  await page.route("**/api/onboarding/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    let body: unknown = { ok: true };
    if (url.includes("provision-tenant")) body = { restaurantId: "rid-e2e-001" };
    else if (url.includes("menu/ingest")) body = { draftId: "draft-e2e-001" };
    else if (url.includes("menu/publish")) body = { ok: true, itemsPreviouslyUnavailable: 0 };
    else if (url.includes("config/")) body = { ok: true };
    else if (url.includes("go-live") && method === "GET")
      body = {
        checklist: {
          whatsapp: { pass: false, required: false, label: "ربط واتساب" },
          menu: { pass: true, required: true, label: "المنيو منشور" },
          hours: { pass: true, required: true, label: "مواعيد العمل" },
          zones: { pass: true, required: false, label: "مناطق التوصيل" },
        },
        alreadyLive: false,
      };
    else if (url.includes("go-live") && method === "POST") body = { activated: true };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

const heading = (page: Page) => page.getByRole("heading", { level: 2 });

test("onboarding wizard completes end-to-end (mocked backend)", async ({ page }) => {
  await mockOnboardingApis(page);
  await page.goto("/onboarding", { waitUntil: "networkidle" });

  // ── Step 1: basics ──
  await expect(heading(page)).toHaveText("أساسيات المطعم");
  await page.getByPlaceholder(/بلبن/).fill("مطعم الذواقة للتجربة");
  await page.getByRole("button", { name: "سعودي" }).click(); // pick a non-default dialect
  await page.getByRole("button", { name: "إنشاء المطعم" }).click();

  // ── Step 2: WhatsApp (unavailable in demo/CI → skip path) ──
  await expect(heading(page)).toHaveText("ربط واتساب الرسمي");
  await page.getByRole("button", { name: "تخطّى دلوقتي" }).click();

  // ── Step 3: menu — validation, then valid publish ──
  await expect(heading(page)).toHaveText("حمّل المنيو");
  // empty submit must NOT advance (stays on the menu step)
  await page.getByRole("button", { name: "احفظ وانشر المنيو" }).click();
  await expect(heading(page)).toHaveText("حمّل المنيو");
  await page.getByText("ضيف قسم واحد على الأقل").first().waitFor();
  // fill a real category + item
  await page.getByPlaceholder(/اسم القسم/).first().fill("برجر");
  await page.getByPlaceholder("اسم الصنف").first().fill("برجر كلاسيك");
  await page.getByPlaceholder("السعر").first().fill("62");
  await page.getByRole("button", { name: "احفظ وانشر المنيو" }).click();

  // ── Step 4: settings — hours gate ──
  await expect(heading(page)).toHaveText("الإعدادات");
  // the go-next button is gated until hours are saved
  await expect(page.getByRole("button", { name: "احفظ المواعيد الأول" })).toBeDisabled();
  await page.getByRole("button", { name: "احفظ المواعيد", exact: true }).click();
  await expect(page.getByRole("button", { name: "للتشغيل" })).toBeEnabled();
  await page.getByRole("button", { name: "للتشغيل" }).click();

  // ── Step 5: go-live ──
  await expect(heading(page)).toHaveText("التشغيل");
  await page.getByRole("button", { name: "شغّل كريم" }).click();

  // ── Success screen ──
  await expect(page.getByRole("heading", { name: /كريم بقى شغّال/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /لوحة الطلبات/ })).toBeVisible();
});
