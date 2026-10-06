// Payment links sent from the app: statuses, the home-card summary, and the
// calls to our server (which talks to Razorpay with the secret keys).

export const SUMMARY_DAYS = 7; // home card and Payment links screen: "last 7 days" (links are valid for 2 days)
const DAY = 24 * 60 * 60 * 1000;
export const CHECK_EVERY_MS = 60 * 1000; // automatic "has it been paid?" check: every minute

// 'awaiting' | 'paid' | 'expired'
export function linkStatus(link, now = Date.now()) {
  if (link.status === 'paid') return 'paid';
  if (link.status === 'expired' || link.status === 'cancelled') return 'expired';
  if (link.expiresAt && link.expiresAt < now) return 'expired';
  return 'awaiting';
}

export function weekSummary(links, now = Date.now()) {
  const since = now - SUMMARY_DAYS * DAY;
  const awaitingLinks = links.filter((l) => linkStatus(l, now) === 'awaiting');
  return {
    sent: links.filter((l) => l.sentAt >= since).length,
    paid: links.filter((l) => linkStatus(l, now) === 'paid' && (l.paidAt ?? l.sentAt) >= since).length,
    awaiting: awaitingLinks.length,
    awaitingAmount: awaitingLinks.reduce((sum, l) => sum + l.amount, 0),
  };
}

// "9:42 am" today, "Yesterday, 6:10 pm", otherwise "2 Oct"
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const time = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
export function when(ts, now = new Date()) {
  const d = new Date(ts);
  const yesterday = new Date(now.getTime() - DAY);
  if (d.toDateString() === now.toDateString()) return time(d);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export const dayName = (ts) => {
  const d = new Date(ts);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const methodLabel = (m) =>
  ({ upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', emi: 'EMI', bank_transfer: 'Bank transfer' })[m] ??
  'Razorpay';

/* ---------- Server calls ---------- */

export async function fetchLinks() {
  const res = await fetch('/api/payment-links');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't load payment links. Try again.");
  return data.links ?? [];
}

export async function resendLink(id) {
  const res = await fetch('/api/resend-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't resend the SMS. Try again.");
}
