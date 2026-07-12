// ============================================================================
// WO-MENU-PRICE-DIGITS — runtime proof (red-first). Exercises the actual reference
// sanitizer and the menu validator, so the fix is proven by behavior, not source
// pattern. Run: node --experimental-strip-types scripts/proof-menu-price-digits.test.ts
// ============================================================================

import { arabicToAscii, sanitizeDecimalInput, sanitizeIntInput, toArabicDigits } from "../lib/util/arabic-digits.ts";
import { validateMenuPayload } from "../lib/onboarding/menu-validate.ts";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- Sanitizer: Arabic-Indic + Eastern digits + ٫ normalized to ASCII ---------
check("٥٠ → 50 (Arabic-Indic accepted, not stripped)", sanitizeDecimalInput("٥٠") === "50");
check("۵۰ → 50 (Eastern Arabic-Indic accepted)", sanitizeDecimalInput("۵۰") === "50");
check("٣٫٥ → 3.5 (Arabic decimal separator ٫ → .)", sanitizeDecimalInput("٣٫٥") === "3.5");
check("mixed ٥0 → 50", sanitizeDecimalInput("٥0") === "50");
check("Latin 50 still works", sanitizeDecimalInput("50") === "50");
check("junk stripped, digits kept: 'a٥b.٥' → 5.5", sanitizeDecimalInput("a٥b.٥") === "5.5");
check("only first decimal point kept (later dots dropped): 5.5.5 → 5.55", sanitizeDecimalInput("5.5.5") === "5.55");
check("sanitizeIntInput drops the point: ٣٠.٥ → 305", sanitizeIntInput("٣٠٫٥") === "305");
check("arabicToAscii bare: ٩ → 9", arabicToAscii("٩") === "9");
check("toArabicDigits(50) → ٥٠ (round-trip display)", toArabicDigits("50") === "٥٠");

// The exact founder red-first case: type ٥٠, it must become the NUMBER 50.
check("RED-FIRST: Number(sanitize('٥٠')) === 50 (was 0 before the fix)", Number(sanitizeDecimalInput("٥٠")) === 50);

// --- Validator: price 0 / empty rejected, positive accepted -------------------
const withPrice = (price: unknown) => validateMenuPayload({ categories: [{ name: "قسم", items: [{ name: "صنف", price }] }] });
check("price 50 → valid", withPrice(50).ok);
check("price 0.1 → valid (small positive ok)", withPrice(0.1).ok);
check("RED-FIRST: price 0 → REJECTED (was accepted before the fix)", !withPrice(0).ok);
check("price -5 → rejected", !withPrice(-5).ok);
check("price NaN (empty→coerced) → rejected", !withPrice(NaN).ok);
check("price missing → rejected", !validateMenuPayload({ categories: [{ name: "قسم", items: [{ name: "صنف" }] }] }).ok);
check("rejection message mentions price", withPrice(0).errors.some((e) => e.includes("price")));

console.log(`\nMENU-PRICE-DIGITS PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
