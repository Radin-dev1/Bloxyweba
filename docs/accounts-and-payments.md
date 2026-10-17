# Domain, accounts and payments: setup

Bloxy has accounts (email + password, Google, Discord, Roblox), a Pro subscription and bit
packs paid through lava.top. The code is done; these steps connect it to your accounts. Every
secret goes in **Vercel → Project → Settings → Environment Variables** (and `.env.local` for
local testing), never in the code or git.

Replace `bloxy.example` below with your domain.

## 1. Domain

1. Vercel → your project → **Settings → Domains** → add `bloxy.example` (and `www.bloxy.example`).
2. At your domain registrar, add the DNS records Vercel shows. Usually:
   - `A` record, name `@`, value `76.76.21.21`
   - `CNAME` record, name `www`, value `cname.vercel-dns.com`
3. Wait until Vercel shows the domain as valid (minutes to a few hours). HTTPS is automatic.
4. Add the env var `SITE_URL=https://bloxy.example` so sign-in and payment redirects always use it.
5. In the Studio plugin, type `https://bloxy.example` as the website URL.

## 2. Accounts

| Variable | What to put |
| --- | --- |
| `AUTH_SECRET` | A long random string (e.g. `openssl rand -base64 32`). Required for any login. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (Vercel → Storage). Accounts and payments are stored here. |
| `ADMIN_ROBLOX_IDS` / `ADMIN_ACCOUNT_IDS` | Who can grant bits (Roblox ids or Bloxy account ids, comma separated). |

**Email + password** works as soon as `AUTH_SECRET` is set.

**Google**: [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services →
OAuth consent screen (External, add your domain) → Credentials → Create credentials → OAuth
client ID → *Web application*. Authorized redirect URIs:
`https://bloxy.example/api/auth/google/callback` (and `http://localhost:3000/api/auth/google/callback`
for local). Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Discord**: [discord.com/developers/applications](https://discord.com/developers/applications) →
New Application → OAuth2. Copy the Client ID and reset/copy the Client Secret. Add redirect
`https://bloxy.example/api/auth/discord/callback`. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

**Roblox**: in your existing OAuth app on create.roblox.com, add the redirect
`https://bloxy.example/api/auth/roblox/callback`. (`ROBLOX_CLIENT_ID` / `ROBLOX_CLIENT_SECRET` stay.)

Buttons only appear for the methods whose id and secret are set. Signing in with a new method
while logged in links it to the same account; a verified Google/Discord email also links to the
account with that email.

## 3. Payments (lava.top)

1. In lava.top, create three products, each with a price in **USD, EUR and RUB**:
   - **Bloxy Pro**: a *subscription*, monthly price (optionally a yearly one too: the pricing page
     then shows a Monthly/Yearly switch).
   - **Bit pack**: a one-time digital product (gives 5,000 bits).
   - **Big bit pack**: a one-time digital product (gives 25,000 bits).
2. Copy each product's **offer id** (the price id; also visible via the API's products list).
3. lava.top → Settings → **API key**: create one.
4. lava.top → **Webhooks**: URL `https://bloxy.example/api/billing/webhook`, authentication by
   **API key**, and use a long random string you make up as the key. Enable payment success,
   payment failed, subscription renewal and subscription cancelled events.
5. Set the env vars and redeploy:

| Variable | What to put |
| --- | --- |
| `LAVA_API_KEY` | The API key from step 3. |
| `LAVA_WEBHOOK_SECRET` | The random string you gave the webhook in step 4. |
| `LAVA_OFFER_PRO` | Offer id of Bloxy Pro. |
| `LAVA_OFFER_BITS_SMALL` | Offer id of the bit pack. |
| `LAVA_OFFER_BITS_LARGE` | Offer id of the big bit pack. |
| `LAVA_BITS_SMALL`, `LAVA_BITS_LARGE` | Optional: bits per pack (defaults 5,000 and 25,000). |
| `BITS_DAILY_PRO` | Optional: Pro daily bits (default 5,000; free is `BITS_DAILY`, default 300). |

Prices on `/pricing` are read live from your lava.top products, so changing a price there needs
no redeploy (they refresh within 10 minutes).

## What happens when someone pays

- Checkout: `/pricing` → Bloxy creates a lava.top invoice for the signed-in account and sends the
  buyer to lava.top's payment page. They come back to `/billing`.
- Bit pack paid: the bits are added once (retries of the same webhook are ignored).
- Pro paid: Pro is on for the period and today's balance tops up to the Pro allowance right away.
  Each renewal extends it. Cancelling (on `/account`) stops renewal; Pro stays on until the end
  of the paid period.
- Refunds and chargebacks are not undone automatically: if you refund someone, take the bits
  back with the admin grant tool (a negative amount) or wait for their Pro period to run out.

## Test it before going live

Make a test purchase with a real card on a cheap test price, then check `/account`: the plan or
bits should change within a few seconds. Vercel → Logs shows lines like
`[bloxy] lava.top payment.success: granted 5000 bits to u_...`.
