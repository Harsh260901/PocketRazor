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
- `src/MembershipsScreen.jsx` – the screen that opens when you tap Memberships, with three tabs: Memberships, Plans, Recommendations.
  - `MembersTab`, `PlansTab`, `RecommendationsTab`: one function per tab. Each shows an empty state for now; replace it with that tab's content.
- `src/index.css` – the phone frame, the two-column card grid, and small tweaks so the tabs match the real app (blue underline, even spacing).
- `src/main.jsx` – wraps the app in Blade's theme (`BladeProvider`).

Blade component docs: https://blade.razorpay.com
