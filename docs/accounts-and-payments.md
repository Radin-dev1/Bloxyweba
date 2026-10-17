# Domain, accounts and payments: setup

Bloxy has accounts (email + password, Google, Roblox), two subscriptions (Pro and
Studio) and bit packs paid through lava.top. The code is done; these steps connect it to your accounts. Every
secret goes in **Vercel → Project → Settings → Environment Variables** (and `.env.local` for
local testing), never in the code or git.

## 1. Domain (trybloxy.com, registered at Squarespace)

Right now trybloxy.com points at Squarespace (four Squarespace `A` records and a `www` CNAME to
`ext-sq.squarespace.com`). Move it to Vercel:

1. **Vercel** → your project → **Settings → Domains** → add `trybloxy.com`, then add
   `www.trybloxy.com` and choose to redirect it to `trybloxy.com`. Vercel then shows the exact
   records it wants. Use those values; they're usually:
   - `A` record, host `@`, value `76.76.21.21`
   - `CNAME` record, host `www`, value `cname.vercel-dns.com`
2. **Squarespace** → Domains → trybloxy.com → **DNS** (DNS settings):
   - Delete the **Squarespace Defaults** preset (the four `A` records `198.185.159.144`,
     `198.185.159.145`, `198.49.23.144`, `198.49.23.145` and the `www` CNAME to
     `ext-sq.squarespace.com`). If a Squarespace site is connected to the domain, disconnect it
     first.
   - Under **Custom records**, add the records Vercel showed in step 1.
   - Leave any `MX` / email records alone if you use email on this domain.
3. Wait until Vercel shows both domains as **Valid Configuration** (usually minutes, up to a few
   hours). HTTPS certificates are automatic.
4. Add the env var `SITE_URL=https://trybloxy.com` and redeploy, so sign-in and payment redirects
   always use the real domain.
5. The Studio plugin now defaults to `https://trybloxy.com` (re-download it from the site). For
   local development, type `http://localhost:3000` in the plugin's Website URL field instead.

## 2. Accounts

| Variable | What to put |
| --- | --- |
| `AUTH_SECRET` | A long random string (e.g. `openssl rand -base64 32`). Required for any login. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (Vercel → Storage). Accounts and payments are stored here. |
| `ADMIN_ROBLOX_IDS` / `ADMIN_ACCOUNT_IDS` | Who can grant bits (Roblox ids or Bloxy account ids, comma separated). |

### Email and Google: through Supabase

Login runs on your Supabase project. Supabase only does the login; accounts, bits, plans and
payments stay in Bloxy (so `AUTH_SECRET` and Redis above are still needed).

1. **Supabase → Project Settings → API** (or *API Keys*): copy the **Project URL** and the
   **anon / publishable** key. In Vercel set:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL (`https://<project-ref>.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon / publishable key (public, safe in the browser).
     Never use the **service_role** key here.
   - Optional: `NEXT_PUBLIC_SUPABASE_PROVIDERS` = which buttons to show (default `google`).
2. **Authentication → URL Configuration**:
   - Site URL: `https://trybloxy.com`
   - Redirect URLs: `https://trybloxy.com/auth/callback`, `https://trybloxy.com/auth/reset`,
     `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/reset`
3. **Authentication → Sign In / Providers**:
   - **Email**: on. Keep *Confirm email* on so people prove their address (they get a link that
     brings them back to Bloxy logged in).
   - **Google**: on. In [Google Cloud](https://console.cloud.google.com) → Credentials → OAuth client
     ID (*Web application*), the Authorized redirect URI is Supabase's
     `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase shows it on the Google
     provider page). Paste the Google client id and secret into Supabase.
4. Redeploy on Vercel (the `NEXT_PUBLIC_` values are built into the page, so a redeploy is needed
   after changing them).

Forgot password works through Supabase too (`/auth/reset`).

### Roblox: Bloxy's own login

Supabase has no Roblox provider, so Roblox keeps Bloxy's own OAuth. In your OAuth app on
create.roblox.com (scopes `openid profile`), add the redirect
`https://trybloxy.com/api/auth/roblox/callback` and set `ROBLOX_CLIENT_ID` / `ROBLOX_CLIENT_SECRET`.

Signing in with Roblox while logged in (Account → Sign-in methods → Link) links it to the same
account, and the other way round. A confirmed Supabase email also links to an existing account
with that verified email.

Without Supabase set up, Bloxy falls back to its own email + password and its own Google
login (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, redirect `/api/auth/google/callback`).

## 3. Payments (lava.top)

1. In lava.top, set up what you sell, each price in **USD, EUR and RUB**:
   - **Pro** and **Studio**: subscriptions. **Done already**: both are prices of the product
     `dc0936b6-7d8a-44b0-b529-6f11867e5fd2`. Pro is offer `3e9cb634-82fe-49ba-ad5b-9fbe2b5abc22`,
     Studio is offer `c3fba64d-6d08-4dc8-aaa4-bdc4e4765319`. Both ids are built into the code, so
     no env var is needed for them. A yearly price on an offer adds a Monthly/Yearly switch.
   - **Bit pack** and **Big bit pack**: one-time digital products (5,000 and 25,000 bits). Not
     created yet; the Bit packs section stays hidden until at least one is set.
2. Copy each id from the product link: `app.lava.top/products/<product id>/<offer id>`. Use the
   **offer id** (the last part). When one product has several prices, as Pro and Studio do, only
   the offer id picks the right one.
3. lava.top → Settings → **API key**: create one.
4. lava.top → **Webhooks**: URL `https://trybloxy.com/api/billing/webhook`, authentication by
   **API key**, and use a long random string you make up as the key. Enable payment success,
   payment failed, subscription renewal and subscription cancelled events.
5. Set the env vars and redeploy:

| Variable | What to put |
| --- | --- |
| `LAVA_API_KEY` | The API key from step 3. |
| `LAVA_WEBHOOK_SECRET` | The random string you gave the webhook in step 4. |
| `LAVA_OFFER_PRO`, `LAVA_OFFER_STUDIO` | Optional: override the built-in Pro / Studio offer ids. |
| `LAVA_OFFER_BITS_SMALL` | Offer id of the bit pack. |
| `LAVA_OFFER_BITS_LARGE` | Offer id of the big bit pack. |
| `LAVA_BITS_SMALL`, `LAVA_BITS_LARGE` | Optional: bits per pack (defaults 5,000 and 25,000). |
| `BITS_MARKUP` | Optional: what bits charge on top of the real AI cost (default `2` = twice the cost, about 50% margin). |
| `BITS_DAILY` | Optional: free bits topped up every day for paid models (default 100). Free models always cost 0. |
| `PLAN_BITS_PER_USD` | Optional: bits a subscription grants per $1 of its USD price on every payment (default 1000 = full value). |
| `AI3D_DAILY_FREE`, `AI3D_DAILY_PRO`, `AI3D_DAILY_STUDIO` | Optional: open-source AI 3D models per day (defaults 2, 25, 100). |

Prices on `/pricing` are read live from your lava.top products, so changing a price there needs
no redeploy (they refresh within 10 minutes).

## What happens when someone pays

- Checkout: `/pricing` → Bloxy creates a lava.top invoice for the signed-in account and sends the
  buyer to lava.top's payment page. They come back to `/billing`.
- Bit pack paid: the bits are added once (retries of the same webhook are ignored).
- Pro or Studio paid: the plan is on for the period, and the payment adds bits worth the plan's
  USD price (e.g. $19.99 adds 19,990 bits; RUB/EUR buyers get the same). Each renewal extends it. Cancelling (on `/account`) stops renewal; the plan stays
  on until the end of the paid period.
- Switching between Pro and Studio: the new plan starts at once and Bloxy cancels the old
  subscription on lava.top, so nobody pays for both. There's no proration: unused time on the old
  plan isn't refunded automatically.
- Refunds and chargebacks are not undone automatically: if you refund someone, take the bits
  back with the admin grant tool (a negative amount) or wait for their Pro period to run out.

## How you make a profit

- 1 bit is worth $0.001 to the buyer: a $19.99 plan gives 19,990 bits, a $5 bit pack should give
  5,000 bits (set `LAVA_BITS_SMALL` / `LAVA_BITS_LARGE` to match your pack prices).
- Every AI request costs bits = its real OpenRouter cost x `BITS_MARKUP` (default 2). So the most
  a buyer's bits can cost you is half of what they paid, even if they spend every bit on the
  priciest model. Free models cost them nothing and cost you nothing.
- Your real costs on top: lava.top's payment fee, and the free daily bits (`BITS_DAILY`, at most
  about $0.05 a day per active free user at the defaults).
- Each model shows its price in the model picker ("≈ 124 bits/msg" for Claude Opus,
  "Free" for free models).

## Test it before going live

Make a test purchase with a real card on a cheap test price, then check `/account`: the plan or
bits should change within a few seconds. Vercel → Logs shows lines like
`[bloxy] lava.top payment.success: granted 5000 bits to u_...`.
