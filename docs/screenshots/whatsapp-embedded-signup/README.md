# WhatsApp Embedded Signup — console_v2 onboarding واتساب step

Review-only visual evidence for PR #392 (`claude/whatsapp-embedded-signup-frontend-tmpu2o`).
**Not for merge** — this branch exists only to host the screenshots.

Captured from `next dev` in demo mode (`NEXT_PUBLIC_CONSOLE_V2=true`, no Supabase →
permissive demo path), driving `/c/onboarding` with Playwright and a stubbed
Facebook JS SDK. The واتساب step is step 1 of the 3-step go-live cockpit.

| File | State | What it shows |
|---|---|---|
| `wa-step-unconfigured.png` | **Unconfigured** | Env vars unset → honest `SOON` ("الربط الذاتي غير مُهيّأ بعد") degrade. No button, no broken popup; points to manual connect in Settings. |
| `wa-step-ready.png` | **Ready** | `NEXT_PUBLIC_WHATSAPP_APP_ID` + `NEXT_PUBLIC_WHATSAPP_CONFIG_ID` set, SDK stubbed → the green "ربط واتساب" connect button is enabled. |
| `wa-step-error.png` | **Error / degraded** | Connect clicked → honest amber "خدمة متعثّرة" chip + ⚠ warning line + "أعد المحاولة" retry. Amber, **not** red (red is reserved for the allergen safety gate). |

All three preserve the 3-step stepper (واتساب / التجربة / التشغيل) and the
8-probe truth board below the card.
