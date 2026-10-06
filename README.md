# Razorpay Products page (Blade prototype)

The Razorpay app's Products screen with a new **Memberships** product under "Share and collect", built with Razorpay's Blade design system.

## Run it

You need Node.js 18 or newer (check with `node -v`; install from nodejs.org if missing).

```bash
cd razorpay-products
npm install --legacy-peer-deps
npm run dev
```

Open the link it prints (usually http://localhost:5173).

`--legacy-peer-deps` is needed because Blade also lists its React Native packages as dependencies; this web project doesn't use them.

## Test it on your phone

Run `npm run dev -- --host`, then open the "Network" link it prints on your phone (phone and laptop on the same Wi-Fi). On a phone the frame disappears and it fills the screen like an app.

## Where things are

- `src/App.jsx` – everything on screen.
  - `shareAndCollect` / `onYourWebsite` lists at the top: edit these to change cards.
- `src/MembershipsScreen.jsx` – the screen that opens when you tap Memberships, with two tabs: Memberships and Plans. Holds the plans and members and decides which screen is showing. Everything resets when the page reloads (there's no database yet).
- `src/MembersTab.jsx` – the Memberships home page: collected this month, Active members, Expiring soon (next 7 days) and Expired (last 30 days) cards.
- `src/CollectionsScreen.jsx` – opens when you tap "Collected this month": money in so far (split into Razorpay-verified and cash/UPI recorded by you), what's still to come this month, money by plan, and every payment this month.
- `src/CashPaymentSheet.jsx` – the "Link or cash?" choice behind every single-member Renew / Send link button, and the Record cash payment panel.
- `src/MemberListScreen.jsx` – the Active / Expiring soon / Expired lists. Active has search and an All / Payment pending filter, with Send link on pending members; Expiring and Expired have Renew and Renew all buttons. All of these send Razorpay payment links.
- `src/MemberDetailsScreen.jsx` – one member's details: contact, status, plan, payment history, Edit and Remove, plus Renew membership / Send payment link for members who need to pay, and the last link sent.
- `src/MemberFormScreen.jsx` – one form for "New member", "Edit member" and members filled in by voice: name, phone, email (optional), plan, billing option, start date, and "Already paid".
- `src/membersData.js` – the sample members (48 paid up, 2 with payment pending, generated relative to today), status rules, date formatting and the collections maths.
- `src/PlansTab.jsx` – the Plans tab: search bar, one card per plan, and the panel that slides up when you tap a plan (prices, edit, delete).
- `src/PlanFormScreen.jsx` – one form for both "New plan" and "Edit plan", modelled on Razorpay's dashboard form: plan name (required), plan description (optional), and one or more billing options, each with a billing frequency ("Every 1 Month(s)") and billing amount. Create plan (or Save changes) and Cancel at the bottom. When editing, changing or removing an existing price asks for confirmation and explains that members keep their current amount until their next billing cycle.
- `src/plansData.js` – the frequency units (weeks, months, years) and friendly names like "Quarterly", the three sample plans, and helpers like rupee formatting. Edit `SAMPLE_PLANS` to change the starting list.
- `src/VoiceSheet.jsx` – the round mic button's panel, used for both "talk to build a plan" and "talk to add a member". Listens with the browser's speech recognition (Indian English), shows the words live, then sends them to the server. "Type instead" works everywhere, including Firefox.
- `api/parse-plan.js` + `api/_parsePlan.js` – server side of voice plans: turns the words into plan fields.
- `api/parse-member.js` + `api/_parseMember.js` – server side of voice members: turns the words into New member fields, only ever picking one of your existing plans.
- `api/_gemini.js` – shared by both: adds the secret Gemini key, calls Gemini, retries when it's busy, and falls back to Flash-Lite.
- `src/SendLinkSheet.jsx` – the "Send payment link" panel behind every Renew / Send link button: confirm, send, then show the result (and the link itself, so you can open it).
- `api/send-payment-links.js` + `api/_paymentLinks.js` – server side: adds the secret Razorpay keys, creates one Razorpay Payment Link per member for their current plan and billing option, and has Razorpay text it to them.
- `src/PaymentLinksScreen.jsx` + `src/linksData.js` – the Payment links tracker (see "Tracking sent links" below).
- `src/index.css` – the phone frame, the two-column card grid, and small tweaks so the tabs match the real app (blue underline, even spacing).
- `src/main.jsx` – wraps the app in Blade's theme (`BladeProvider`).

Blade component docs: https://blade.razorpay.com

## Voice plans (Gemini AI): setting up your key

The voice feature needs a Gemini API key. The key is a password for your Google AI account, so it must stay secret. It lives **only on the server**: in `.env.local` on your laptop and in Vercel's Environment Variables online. It is never in the code, never on GitHub, and never sent to the browser.

### 1. Get a free key
1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.
3. Don't turn on billing for that Google project. You stay on the free tier, so you can't be charged; if the free limit runs out, voice stops working until the limit resets.

### 2. Use it on your laptop
In the project folder, in a terminal:
```
cp .env.example .env.local
```
Open `.env.local` in any text editor (on a Mac: `open -e .env.local`), replace `paste-your-key-here` with your key, and save. Restart `npm run dev`.

`.env.local` is listed in `.gitignore`, so GitHub Desktop will never offer to upload it.

### 3. Use it on Vercel (the live site)
1. Vercel → your project → **Settings → Environment Variables**.
2. Key: `GEMINI_API_KEY`. Value: your key. Environments: Production and Preview. **Save**.
3. Go to **Deployments**, open the **⋯** menu on the latest one and click **Redeploy**. New variables only apply to new deployments.

### Rules
- Never paste the key into any file in `src/`, a commit, or a chat message.
- If the key ever leaks, delete it in AI Studio and create a new one, then update `.env.local` and Vercel.
- The microphone only works on `https://` pages or `localhost`. Test voice on your phone using the Vercel link, not the `--host` network address.

## Payment links (Razorpay): setting up your keys

Renew, Renew all, Send link and Send payment link all create a **Razorpay Payment Link** for the member's current plan and billing option, and Razorpay texts it to them. The keys live only on the server, exactly like the Gemini key.

### 1. Get Test Mode keys
1. Log in to the Razorpay Dashboard and switch to **Test Mode** (toggle at the top).
2. Go to **Account & Settings → API Keys** and click **Generate Key**.
3. Copy the **Key ID** (starts with `rzp_test_`) and the **Key Secret**. The secret is shown only once.

### 2. On your laptop
Add these two lines to `.env.local` (no quotes), then restart `npm run dev`:
```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxx
```
Each SMS goes to the phone number on the member's card. The sample members have made-up numbers that could belong to real people, so only send links to members whose number you've entered or edited to someone who's agreed to get them. Links are sent by SMS only, never by email.

Optional: add `RAZORPAY_SMS_TO=<10-digit mobile>` to send every SMS to that one number instead.

### 3. On Vercel
Add the same two as Environment Variables (Production and Preview), then **Deployments → ⋯ → Redeploy**.

### Good to know
- **Test Mode allows only 30 payment links in total** per Razorpay account. "Renew all" uses one per member, so test with single members.
- Razorpay's docs don't say whether SMS is actually delivered in Test Mode. Either way, after sending, the app shows the link so you can open Razorpay's payment page and pay with Razorpay's test cards or UPI.
- After someone pays, the app notices within a minute (see Tracking sent links) and renews that member. Don't reload the page in between: members you added yourself are lost on reload.

## Tracking sent links

- **Home card "Payment links · last 7 days"**: how many links you sent and how many got paid in the last 7 days (each link can be paid for 2 days), plus how many are still awaiting payment and for how much.
- **Payment links screen** (tap the card): every link sent in the **last 7 days** (for members currently in the app), loaded live from Razorpay, so it survives a page reload. Filter by Awaiting / Paid / Expired. Tap ↻ to refresh.
- **Automatic check:** while any link is awaiting payment, the app asks Razorpay **every minute**, and straight away when you switch back to its tab. If someone has paid, they're renewed and a notice pops up ("Rahul Kumar paid. Membership renewed."); tap it to open the tracker. It pauses while the tab is hidden or nothing is awaiting. The timing is `CHECK_EVERY_MS` in `src/linksData.js`. (This runs in the open app, not as a Vercel cron job: Vercel's free plan only allows cron jobs once a day, and the members live in the browser anyway.)
- **Tap a link** to see when it was sent, whether it was paid (and how), when it expires, plus Open, Copy and **Resend SMS** (texts the same link again).
- When a link shows as paid, the member is renewed once: a pending member becomes active, and anyone else gets one more billing period with the payment recorded as "UPI · payment link" (or whichever method they used).
- Files: `src/PaymentLinksScreen.jsx`, `src/linksData.js`, `api/payment-links.js`, `api/resend-link.js` (both handled in `api/_paymentLinks.js`).

## Collections and cash payments

- **Collected this month** (tap the card): total so far, compared with last month; split into **Via Razorpay · verified** (payment links, confirmed by Razorpay) and **Cash/UPI · recorded by you**; a bar showing progress toward what you should collect this month.
- **Still to come**: *Expected by month-end* = paid-up members whose membership ends between today and the end of the month, at their current price (an estimate: it assumes everyone renews). Tap it for the **Due by …** list. *Payment pending* opens Active members filtered to Payment pending.
- **By plan** and **Payments**: every payment this month, newest first, tagged Razorpay or how it was paid. Tap one to open the member.
- **Renew / Send link on a member's card**, and **Renew / Collect payment** on member details, open the renewal panel: the **plan for the next period** (✎ Edit at its top right to switch plan or billing option) and then **Send payment link** (Razorpay) or **Record cash payment**. Renew all stays payment links only.
- **Changing a plan only happens here, at renewal.** With a payment link, the member switches to the new plan once they pay (the plan travels with the link in Razorpay's notes). With cash, they switch when you save.
- **Edit member** (✎ on member details) changes name, phone and email only; the plan is shown but locked. Remove is the 🗑 icon next to it.
- **Record cash payment** (also on member details): amount is the plan price, pick the date and Cash or UPI to my QR. Renewals continue from the current end date; if the membership had already ended, it restarts on the day they paid. A pending member is simply marked as paid.
- The app can't see cash or UPI paid to your own QR code, so those only count once you record them.
