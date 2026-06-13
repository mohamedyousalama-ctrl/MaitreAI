# WhatsApp — Permanent System-User Access Token (pilot-readiness #2)

The token MaitreAI uses to **send** WhatsApp replies is `WHATSAPP_ACCESS_TOKEN`.
The token you get from the App dashboard's **API Setup** panel is **temporary**
— it expires in **24 hours** (the default test token) or **60 days** (a user
token). When it lapses, every outbound reply silently fails (Graph API returns
`190 — access token expired`) and the pilot goes dark with no warning.

The fix is a **System User token that never expires.** This is a one-time setup
in Meta Business Manager. Do it before the pilot scales. ~10 minutes.

---

## Why a System User (not a personal token)

| | Personal/test token | **System User token** |
|---|---|---|
| Expiry | 24h or 60 days | **Never** (when generated with no expiry) |
| Tied to | your personal login | the **business**, not a person |
| Survives | you logging out / password change | yes — survives staff changes |
| Right choice for a server | no | **yes** |

A System User is a non-human "service account" owned by the business. Its token
is what production servers are *supposed* to use.

---

## Prerequisites (one-time, you likely already have these)

- A **Meta Business Manager** account (business.facebook.com) that owns:
  - the **App** (the one whose webhook is `https://www.maitre.chat/api/whatsapp/webhook`), and
  - the **WhatsApp Business Account (WABA)** with the phone number.
- You are an **admin** of that Business.

If the App and WABA are under different businesses, move them under one first
(Business Settings → Accounts → Apps / WhatsApp Accounts → Add).

---

## Steps

### 1. Create the System User

1. Go to **business.facebook.com** → **Business Settings** (gear icon).
2. Left sidebar → **Users → System Users**.
3. Click **Add** → name it e.g. `maitreai-server` → role **Admin**
   (Admin is simplest; Employee works too if you assign assets in step 2).
4. **Create system user.**

### 2. Give the System User access to the App and the WhatsApp account

Still on the System User you just made → **Add Assets**:

1. **Apps** → select your App → enable **Manage app** (full control) → Save.
2. **WhatsApp Accounts** → select your WABA → enable **Manage WhatsApp account**
   (full control) → Save.

> If you skip this, the generated token won't have permission over the number
> and sends will 403.

### 3. Generate the never-expiring token

On the same System User → **Generate New Token**:

1. **App:** pick your App.
2. **Token expiration:** **Never**. ← the whole point.
3. **Permissions:** check **`whatsapp_business_messaging`** and
   **`whatsapp_business_management`**.
4. **Generate token.**
5. **Copy it now** — Meta shows it **once**. If you lose it, just generate a new
   one (the old one keeps working until you revoke it).

### 4. Put it in Vercel and redeploy

1. Vercel → project → **Settings → Environment Variables**.
2. Edit **`WHATSAPP_ACCESS_TOKEN`** → paste the new token → scope **Production**
   (and Preview, if you test there) → Save.
3. **Redeploy** (Deployments → ⋯ → Redeploy, or push a commit).

That's it. `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_RESTAURANT_ID` are unchanged — only the access
token swaps.

---

## Verify it worked

1. Send a WhatsApp message to the number → كريم should reply as before.
2. Confidence the token is permanent — **Access Token Debugger:**
   - Go to **developers.facebook.com/tools/debug/accesstoken**
   - Paste the token → **Debug**
   - **Expires:** should read **Never**.
   - **Scopes:** should include `whatsapp_business_messaging` +
     `whatsapp_business_management`.

---

## When to regenerate

A "never-expiring" System User token is still invalidated if you:

- **change your Meta account password** (sometimes), or
- **remove the System User's access** to the App/WABA, or
- **manually revoke** it.

If sends start returning `190` again, repeat **step 3** (generate a fresh token)
and **step 4** (swap it in Vercel). No code change is ever needed — it's always
just the env var.

---

## Relationship to the other env vars

This doc covers **only** `WHATSAPP_ACCESS_TOKEN` (the *send* credential). The
*receive* credential — `WHATSAPP_APP_SECRET`, which validates the inbound
`X-Hub-Signature-256` — is a **separate** value from **App → Settings → Basic →
App Secret**, and is the subject of the in-progress signature re-secure
(pilot-readiness #1). The two are independent: the access token lets us *send*;
the app secret lets us *trust what we receive*. See `WHATSAPP_GO_LIVE.md` for the
full env matrix.
