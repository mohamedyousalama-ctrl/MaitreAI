# Meta / WhatsApp Business Platform — Setup Guide for Production Onboarding

> **⚠️ Meta's console changes frequently.**
> Button names, screen layouts, and exact requirements shift without notice. Treat this guide as a map, not a script — if a screen looks different, follow [Meta's official Embedded Signup documentation](https://developers.facebook.com/docs/whatsapp/embedded-signup) and their [Tech Provider guide](https://developers.facebook.com/docs/whatsapp/solution-providers/tech-providers) as the final word. Come back here for the parts that are specific to *our* code (env var names, webhook URL, request body shape).

---

## 1. What this is and why

We are a **Tech Provider** on the Meta WhatsApp Business Platform — this means each restaurant connects its *own* WhatsApp number through our app's onboarding screen (called Embedded Signup), rather than us holding a single shared number. Without completing the setup in this guide, the WhatsApp step in our onboarding flow will show an error to every new restaurant owner and they will be unable to connect their number.

---

## 2. What you need before starting

Go through this checklist before touching the Meta dashboard. Starting without these will waste time.

- [ ] **A personal Facebook account** that has admin access to (or will create) a Meta Business Portfolio.
- [ ] **A Meta Business Portfolio** with Business Verification completed (or in progress). This is slow — *start it first*. See Step 3a below.
- [ ] **A privacy-policy URL** that is publicly accessible. Meta will reject the app without one. A simple hosted page listing how we handle customer data is enough.
- [ ] **Our production domain** — the `https://` URL where the app is deployed (e.g. `https://maitreai.vercel.app`). You need this to whitelist it in Meta.
- [ ] **Access to our Vercel project** — specifically the *Environment Variables* section in Vercel's project settings, so you can paste secrets. You need at least *Editor* access.
- [ ] **Ability to record two short screen videos** (no audio needed; your screen only). These are submitted during App Review. See Step 3h.

---

## 3. Step-by-step setup

### 3a. Create a Meta Business Portfolio and start Business Verification *(do this first — it takes days)*

1. Go to [business.facebook.com](https://business.facebook.com) and sign in with a personal Facebook account.
2. Click the grid (⊞) menu → **Business Settings**.
3. If you don't already have a business portfolio, follow the prompts to create one. Fill in your legal business name and website.
4. Inside Business Settings, go to **Security Center** → **Business Verification**. Click **Start Verification**.
   - You will be asked to upload documents (business registration certificate, utility bill, etc.). The review takes **2–7 business days**. Some features are locked behind this.
   - **Start this step immediately and move on** — you can complete the rest of the setup in parallel while verification is pending.

---

### 3b. Create the Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com) → click **My Apps** → **Create App**.
2. When asked "What do you want your app to do?", choose **Other**, then click **Next**.
3. When asked for App Type, choose **Business**, then click **Next**.
4. Fill in the App Name. **Critical rules about the name:**
   - Do **not** include the words "WhatsApp", "WA", or "Messenger".
   - Do **not** use Meta's or Facebook's logo or name in a way that suggests you are affiliated with Meta.
   - *Why this matters:* restaurant owners see this app name during the Embedded Signup consent screen — it represents our product, not Meta.
   - A name like "MaitreAI" or "Kivo" is fine.
5. Link the app to the Business Portfolio you created in Step 3a.
6. Click **Create App**. Meta may ask you to confirm your identity.

---

### 3c. App Settings → Basic: icon, privacy policy, category

After the app is created, you land in the App Dashboard.

1. In the left sidebar, go to **Settings** → **Basic**.
2. Set **App Icon** — upload a square logo (1024×1024 px recommended). No Meta logos.
3. Set **Privacy Policy URL** — paste the publicly accessible URL from your checklist.
4. Set **Category** — choose *Business and Pages* or the closest fit.
5. Click **Save Changes**.

---

### 3d. Copy App ID + App Secret → paste into Vercel *(this is the critical wiring step)*

This step connects Meta to our code. Without it, the WhatsApp onboarding step fails immediately.

**In the Meta App Dashboard:**

1. Go to **Settings** → **Basic**.
2. At the top of the page you will see **App ID** — a long number (e.g. `123456789012345`). Copy it.
3. Next to **App Secret**, click **Show** (you may need to re-enter your Facebook password). Copy the secret.

**In Vercel:**

1. Open your Vercel project → **Settings** → **Environment Variables**.
2. Add the following two variables. Make sure you add them to all relevant environments (Production at minimum):

   | Variable Name | Where to find the value |
   |---|---|
   | `WHATSAPP_APP_ID` | The **App ID** number copied above |
   | `WHATSAPP_APP_SECRET` | The **App Secret** string copied above |

3. Click **Save** for each. These values are **secrets** — never put them in code, chat messages, or emails.

> **Why two separate secrets?**
> `WHATSAPP_APP_ID` is used when a restaurant owner goes through Embedded Signup — our server exchanges their short-lived auth code for a long-lived access token on their behalf. `WHATSAPP_APP_SECRET` is used for two things: that same token exchange, *and* verifying the cryptographic signature on every inbound WhatsApp message to confirm it really came from Meta (not a spoof).

---

### 3e. Add the WhatsApp product and configure Embedded Signup

1. In the left sidebar of the App Dashboard, scroll to **Add a Product** and click **Set Up** next to **WhatsApp**.
2. You will land on the WhatsApp Getting Started page. You can skip the quickstart wizard.
3. In the left sidebar (now expanded), go to **WhatsApp** → **Configuration**.
4. Scroll to the **Embedded Signup** section. Click **Create new Signup configuration** (or **Add configuration**).
5. Give it a name (e.g. "MaitreAI Production Signup") and save it.
6. You will see a **Configuration ID** (a number). You will need to pass this ID to whoever implements the frontend Embedded Signup button — it tells the Meta JavaScript SDK which flow to run.
7. Still in WhatsApp → Configuration, find the **Allowed Domains** or **JavaScript SDK** section:
   - Add our production domain to **Domains allowed to use JavaScript SDK** (e.g. `https://maitreai.vercel.app`).
8. Go to **Facebook Login** in the left sidebar (under Products) → **Settings**:
   - Under **Valid OAuth Redirect URIs**, add our production domain (e.g. `https://maitreai.vercel.app`).
   - Click **Save Changes**.

> **What the Configuration ID is for:** when a restaurant owner clicks "Connect WhatsApp" in our app, the Meta JavaScript SDK pops up a modal using this configuration. After the owner completes the flow, Meta sends a short-lived `code` back to our frontend. Our backend (the embedded-signup route) then exchanges that `code` for a long-lived token. The Configuration ID tells Meta which flow/permissions to show the owner.

---

### 3f. Webhook setup — connecting Meta to our server

This tells Meta where to send inbound WhatsApp messages. Every message a customer sends goes here first.

**Our webhook URL is:**
```
https://<YOUR_PRODUCTION_DOMAIN>/api/whatsapp/webhook
```
Replace `<YOUR_PRODUCTION_DOMAIN>` with your actual Vercel domain, e.g.:
```
https://maitreai.vercel.app/api/whatsapp/webhook
```

**The verify token** is an arbitrary string *you choose*. It proves to Meta that the webhook belongs to us (Meta will call the URL with this token and expect our server to echo it back). Choose any non-guessable string (a random UUID works well). **Write it down** — you need to put the exact same string in two places:

1. **In Vercel** → Environment Variables → add:

   | Variable Name | Value |
   |---|---|
   | `WHATSAPP_VERIFY_TOKEN` | The arbitrary string you chose |

2. **In Meta** → WhatsApp → Configuration → **Webhook** section:
   - Click **Edit** (or **Add callback URL**).
   - **Callback URL:** paste the full webhook URL from above.
   - **Verify Token:** paste the exact same string you set in Vercel.
   - Click **Verify and Save**. Meta will immediately call our URL to confirm the token matches. ✅ means it worked; ❌ means the URL isn't reachable or the token doesn't match.

3. After saving, click **Manage** next to your webhook and subscribe to at minimum:
   - `messages` — all inbound messages
   - `messaging_postbacks` — button taps

> **How this works in our code:** when Meta calls our webhook to verify it (`GET /api/whatsapp/webhook`), our server checks the token against both the global `WHATSAPP_VERIFY_TOKEN` env var and each active tenant's stored verify token. The first match wins and our server echoes the challenge back. When Meta delivers an actual inbound message (`POST /api/whatsapp/webhook`), our server verifies the cryptographic signature using `WHATSAPP_APP_SECRET` before processing.

---

### 3g. The encryption key — protect stored tokens

When a restaurant owner completes Embedded Signup, we receive their WhatsApp access token and store it **encrypted** in our database. This requires one more env var:

1. Generate a 64-character hexadecimal string (32 random bytes). On a Mac/Linux terminal:
   ```bash
   openssl rand -hex 32
   ```
   Copy the output — it will look like: `a3f1c9...` (64 characters).

2. In Vercel → Environment Variables → add:

   | Variable Name | Value |
   |---|---|
   | `CREDENTIALS_ENCRYPTION_KEY` | The 64-character hex string |

   This must be exactly 64 hex characters. Too long or too short and the app will refuse to start.

> **Keep this secret safe.** Losing it means existing stored tokens can no longer be decrypted and every restaurant owner would need to reconnect their WhatsApp. Back it up in a secure password manager (not a spreadsheet or email).

---

### 3h. App Review — unlocking real users

In Development mode your app can only be used by **people who have a role on the app** (developers, testers). To allow real restaurant owners to connect their WhatsApp numbers, you must submit for App Review and get **Advanced Access** to:

- `whatsapp_business_management` — lets us manage WABAs (WhatsApp Business Accounts) on behalf of restaurant owners.

**How to submit:**

1. In the App Dashboard, go to **App Review** → **Permissions and Features**.
2. Find `whatsapp_business_management` and click **Request Advanced Access**.
3. Fill in the business use-case description. Be clear: *"Restaurant owners use our platform to connect their own WhatsApp Business number. We use Embedded Signup to obtain their authorization and then send AI-generated replies to their customers on their behalf."*

**The two required screen recordings:**

Meta requires video proof that the permission is being used as described. No audio is needed — just screen recordings. Keep them short (60–90 seconds each).

> **Video 1 — Send a message from the app, received in WhatsApp:**
> - [ ] Open our app's onboarding screen.
> - [ ] Complete the Embedded Signup flow (connecting a test WhatsApp number).
> - [ ] Show a customer sending a WhatsApp message to that number.
> - [ ] Show the AI reply arriving in the customer's WhatsApp.
>
> **Video 2 — Create a message template:**
> - [ ] Log in to [business.facebook.com](https://business.facebook.com).
> - [ ] Go to WhatsApp Manager → Message Templates.
> - [ ] Create a new template (any category) and show it being submitted.
> - [ ] Show the template status (approved or pending).

---

### 3i. Switch App Mode to Live

This is the final step. Development mode restricts who can use the Embedded Signup.

1. In the App Dashboard, at the top of the page, toggle the switch from **Development** to **Live**.
2. Meta may ask you to confirm app details and accept terms.
3. ⚠️ **Do not switch to Live before:**
   - Business Verification is approved (Step 3a).
   - The privacy policy URL is set (Step 3c).
   - App Review for `whatsapp_business_management` is approved (Step 3h).
   - If you switch early, real users will see errors during Embedded Signup.

---

## 4. The partner decision

Meta offers the option to onboard through a **Solution Partner** (companies like Twilio, 360Dialog, Vonage, or Bird) instead of connecting to Meta's platform directly as we are doing here.

**With a Solution Partner:**
- Setup is faster and they handle some of the compliance/verification burden.
- They provide support and managed infrastructure.
- You pay an ongoing per-message or monthly fee to the partner *on top of* Meta's own messaging fees.

**Without a Solution Partner (Tech Provider path — what this guide covers):**
- No partner fees — you pay Meta directly.
- More setup work upfront (this entire guide).
- You own the integration end-to-end.

**This is a business decision for Mohamed to confirm**, not a technical one. Once a path is chosen it is difficult to switch. The guide covers the partner-less Tech Provider path because that is what the current codebase implements.

---

## 5. How to test it worked

You do not need to wait for full App Review to test. In **Development mode**, Embedded Signup works for:
- **People with a role on your Meta app** (developers, testers, administrators — add them in App Dashboard → Roles).

**Message volume limits by stage:**

| Stage | Limit per 7 rolling days |
|---|---|
| Development mode (no verifications) | 10 new customers |
| Business Verification approved | Rises to ~250 |
| App Review approved (Advanced Access) | 1,000+ (rises with use) |
| Access Verification approved | Unlimited |

**To test end-to-end in Development mode:**

1. Add a test user to your Meta app (App Dashboard → Roles → Add People) and use their personal Facebook account to go through the Embedded Signup on our onboarding screen.
2. Have them send a WhatsApp message to their connected business number.
3. Confirm the message appears in our dashboard and the AI replies.
4. Check that `wa_configured_at` is set on the restaurant row (you can confirm this in the Supabase dashboard by looking at the `restaurants` table).

---

## 6. Glossary

**WABA (WhatsApp Business Account)** — the business-level account on Meta that "owns" one or more WhatsApp phone numbers. Each restaurant that connects through our app will have their own WABA.

**Phone Number ID** — a numeric identifier that Meta assigns to each individual phone number registered in a WABA. This is *not* the phone number itself (e.g. `+966...`). Our code uses this ID to route messages to the right tenant.

**Embedded Signup** — the Meta-provided pop-up modal that appears when a restaurant owner clicks "Connect WhatsApp" in our app. It lets the owner connect their business number to our platform without sharing their credentials with us directly.

**Tech Provider** — how we are classified on the Meta platform. It means we are a software company enabling other businesses (the restaurants) to use WhatsApp — not a business using WhatsApp for our own communications.

**App Review** — a Meta process where Meta's team manually reviews a developer app and approves (or denies) access to sensitive permissions. Required before real restaurant owners can use Embedded Signup.

**Webhook** — a URL on our server that Meta calls every time something happens: a customer sends a message, a message is delivered, a message is read, etc. Without a working webhook, messages are never received by our system.

**Verify Token** — an arbitrary secret string that you set in both Vercel (as `WHATSAPP_VERIFY_TOKEN`) and in Meta's webhook configuration. When Meta first connects to our webhook URL, it sends this token — our server checks it matches, then confirms the connection. It prevents random internet traffic from pretending to be Meta.

---

## 7. Where this connects to our code

For an engineer picking this up later, here is the map between this guide and the codebase:

**Embedded Signup handler** — `app/api/onboarding/embedded-signup/route.ts`

This route receives `{ restaurantId, code, phoneNumberId, wabaId }` from the frontend after the owner completes the Meta modal. It reads `WHATSAPP_APP_ID` and `WHATSAPP_APP_SECRET` from env to exchange the `code` for a long-lived token via `GET https://graph.facebook.com/v19.0/oauth/access_token`. It then calls `POST https://graph.facebook.com/v19.0/{wabaId}/subscribed_apps` to register the webhook subscription. The token is encrypted using `CREDENTIALS_ENCRYPTION_KEY` before storage.

**Inbound webhook** — `app/api/whatsapp/webhook/route.ts`

Path: `/api/whatsapp/webhook`. Handles both the Meta verification handshake (`GET`) and inbound messages (`POST`). Reads `WHATSAPP_VERIFY_TOKEN` for the global verify check. Validates the `X-Hub-Signature-256` header using `WHATSAPP_APP_SECRET`. Routes each message to the right tenant by matching the inbound `phone_number_id` against stored per-tenant credentials.

**WhatsApp env config** — `lib/messaging/config.ts`

`readWhatsAppEnv()` reads `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` from env (or a per-request override for per-tenant routing).

**Token encryption** — `lib/crypto/secrets.ts`

`encryptSecret()` / `decryptSecret()` use `CREDENTIALS_ENCRYPTION_KEY` (64-char hex = 32-byte AES-256-GCM key).

### Complete list of Meta-related environment variables

Set all of these in Vercel → Settings → Environment Variables → **Production** (and Staging/Preview as needed):

| Variable | Required for | Where the value comes from |
|---|---|---|
| `WHATSAPP_APP_ID` | Embedded Signup (token exchange) | Meta App Dashboard → Settings → Basic → App ID |
| `WHATSAPP_APP_SECRET` | Token exchange + webhook signature | Meta App Dashboard → Settings → Basic → App Secret (click Show) |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification handshake | You choose any non-guessable string; must match what you enter in Meta's Webhook config |
| `CREDENTIALS_ENCRYPTION_KEY` | Encrypting per-tenant tokens in DB | Generate with `openssl rand -hex 32`; store in a password manager |
| `WHATSAPP_ACCESS_TOKEN` | Global/fallback outbound sending (Wesaya legacy path) | Meta → WhatsApp → API Setup → Temporary or Permanent Token |
| `WHATSAPP_PHONE_NUMBER_ID` | Global/fallback routing (Wesaya legacy path) | Meta → WhatsApp → API Setup → Phone Number ID |

> **Note on the last two:** `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are the legacy global credentials for the original single-tenant (Wesaya) path. For multi-tenant self-serve onboarding, each restaurant's token and phone number ID are stored per-row in the database (via the Embedded Signup route) and do not need to be set in Vercel. The global vars are a fallback only.
