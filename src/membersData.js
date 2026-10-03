// Members, their membership periods and payments, plus the date maths
// behind the Memberships page. Sample members are generated relative to
// today, so the cards always look realistic whenever you open the app.

import { SAMPLE_PLANS } from './plansData.js';

export const EXPIRING_WINDOW_DAYS = 7; // "Expiring soon" = ends in the next 7 days
export const EXPIRED_WINDOW_DAYS = 30; // "Expired" = ended in the last 30 days

/* ---------- Dates ---------- */

export const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const today = () => startOfDay(new Date());
const DAY = 24 * 60 * 60 * 1000;
export const addDays = (d, n) => new Date(startOfDay(d).getTime() + n * DAY);
export const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY);

// Add months without overflowing: 31 Jan + 1 month = 28/29 Feb
export const addMonths = (d, n) => {
  const x = startOfDay(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const lastDay = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, lastDay));
  return x;
};

// End of one billing period that starts on `start`
export const addPeriod = (start, { interval, unit }, times = 1) => {
  if (unit === 'week') return addDays(start, 7 * interval * times);
  if (unit === 'year') return addMonths(start, 12 * interval * times);
  return addMonths(start, interval * times);
};

// "3 Oct", "Sat, 4 Oct", "3 Mar 2026" (Razorpay style: "Sep", not "Sept")
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtDay = (d) => {
  const x = new Date(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]}`;
};
export const fmtWeekday = (d) => `${WEEKDAYS[new Date(d).getDay()]}, ${fmtDay(d)}`;
export const fmtFull = (d) => `${fmtDay(d)} ${new Date(d).getFullYear()}`;

// For <input type="date">: "2026-10-02" in local time
export const toInputDate = (d) => {
  const x = new Date(d);
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${mm}-${dd}`;
};
export const fromInputDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/* ---------- Status ---------- */

// 'pending'  = added but hasn't paid yet
// 'expiring' = active, ends within the next 7 days (still counts as active)
// 'active'   = paid up, ends later than that
// 'expired'  = ended in the last 30 days
// 'lapsed'   = ended more than 30 days ago (not shown on the cards)
export function memberStatus(m, now = today()) {
  if (!m.paid) return 'pending';
  const left = daysBetween(now, m.periodEnd);
  if (left < 0) return -left <= EXPIRED_WINDOW_DAYS ? 'expired' : 'lapsed';
  if (left <= EXPIRING_WINDOW_DAYS) return 'expiring';
  return 'active';
}

export const isActive = (m) => ['active', 'expiring'].includes(memberStatus(m));

export function expiryText(m, now = today()) {
  const left = daysBetween(now, m.periodEnd);
  if (left === 0) return 'Expires today';
  if (left === 1) return 'Expires tomorrow';
  if (left > 1) return `Expires ${fmtWeekday(m.periodEnd)}`;
  if (left === -1) return 'Expired yesterday';
  return `Expired ${fmtDay(m.periodEnd)}`;
}

// "just now", "5 min ago", "2 hr ago", "3 Oct"
export function sentAgo(date, now = new Date()) {
  const mins = Math.floor((now - new Date(date)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} hr ago`;
  return fmtDay(date);
}

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

// "+91 98765 43210"
export const fmtPhone = (digits) => `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
// Accepts "98765 43210", "+91-98765-43210", "09876543210" → "9876543210", or null if not a valid Indian mobile
export const normalisePhone = (s) => {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};

/* ---------- Money ---------- */

export function collections(members, now = today()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Same point last month, for a fair comparison (e.g. 1–12 Sep vs 1–12 Oct)
  const lastMonthSamePoint = addMonths(now, -1);
  let thisMonth = 0;
  let lastMonthSoFar = 0;
  let lastMonthTotal = 0;
  for (const m of members) {
    for (const p of m.payments) {
      const d = startOfDay(p.date);
      if (d >= monthStart && d <= now) thisMonth += p.amount;
      else if (d >= lastMonthStart && d < monthStart) {
        lastMonthTotal += p.amount;
        if (d <= lastMonthSamePoint) lastMonthSoFar += p.amount;
      }
    }
  }
  // A % change is only meaningful once there's a bit of the month to compare
  const change =
    now.getDate() >= 10 && lastMonthSoFar > 0
      ? Math.round(((thisMonth - lastMonthSoFar) / lastMonthSoFar) * 100)
      : null;
  const dueThisWeek = members.filter((m) => memberStatus(m, now) === 'expiring').reduce((s, m) => s + m.price.amount, 0);
  return { thisMonth, change, lastMonthTotal, dueThisWeek };
}

/* ---------- Creating members ---------- */

let idCounter = 0;
export function makeMember({ name, phone, email, plan, price, startDate, paid, method = 'Cash or UPI' }) {
  const start = startOfDay(startDate);
  return {
    id: `m${Date.now()}${idCounter++}`,
    name,
    phone,
    email: email || '',
    planId: plan.id,
    planName: plan.name, // kept even if the plan is renamed or deleted later
    price: { interval: price.interval, unit: price.unit, amount: price.amount },
    memberSince: start,
    periodStart: start,
    periodEnd: addPeriod(start, price),
    paid,
    payments: paid ? [{ date: today(), amount: price.amount, method }] : [],
  };
}

/* ---------- Sample members ---------- */

const NAMES = [
  'Rahul Kumar', 'Priya Sharma', 'Arjun Mehta', 'Sneha Nair', 'Rohan Desai', 'Vikram Rao', 'Anita Joshi',
  'Karan Das', 'Meera Iyer', 'Nikhil Gupta', 'Aisha Khan', 'Siddharth Rao', 'Pooja Patel', 'Aditya Singh',
  'Kavya Reddy', 'Manish Verma', 'Divya Menon', 'Harsh Vardhan', 'Neha Kapoor', 'Rajesh Pillai',
  'Ishita Banerjee', 'Varun Malhotra', 'Shreya Ghosh', 'Amit Chauhan', 'Tanvi Kulkarni', 'Farhan Sheikh',
  'Ritu Agarwal', 'Gaurav Saxena', 'Lakshmi Narayan', 'Deepak Yadav', 'Anjali Mishra', 'Suresh Babu',
  'Nandini Rao', 'Kunal Shah', 'Swati Jain', 'Pranav Hegde', 'Zoya Ahmed', 'Abhishek Tiwari', 'Ramya Krishnan',
  'Yash Thakur', 'Simran Kaur', 'Mohit Bansal', 'Bhavna Sethi', 'Tarun Bhatia', 'Gayatri Iyengar',
  'Omkar Patil', 'Sana Mirza', 'Vivek Anand',
];

// Small seeded random generator, so the sample data is the same on every load
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function buildSampleMembers(plans = SAMPLE_PLANS) {
  const rand = seeded(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const now = today();
  const byName = Object.fromEntries(plans.map((p) => [p.name, p]));
  const gold = byName['Gold gym'];
  const yoga = byName['Yoga classes'];
  const swim = byName['Swimming'];
  const methods = ['UPI', 'UPI', 'UPI', 'Card', 'Cash'];

  // Fixed cases first so the cards always show 5 expiring and 3 expired
  const fixed = [
    { name: 'Rahul Kumar', plan: gold, opt: 0, endIn: 1 },
    { name: 'Priya Sharma', plan: yoga, opt: 0, endIn: 2 },
    { name: 'Arjun Mehta', plan: gold, opt: 1, endIn: 4 },
    { name: 'Sneha Nair', plan: swim, opt: 0, endIn: 6 },
    { name: 'Rohan Desai', plan: yoga, opt: 0, endIn: 7 },
    { name: 'Vikram Rao', plan: gold, opt: 0, endIn: -3 },
    { name: 'Anita Joshi', plan: yoga, opt: 1, endIn: -11 },
    { name: 'Karan Das', plan: swim, opt: 0, endIn: -20 },
  ];
  // Everyone else is active, spread across plans (Gold gym most popular)
  const planMix = [gold, gold, gold, gold, yoga, yoga, yoga, swim, swim];
  const rest = NAMES.filter((n) => !fixed.some((f) => f.name === n)).map((name) => {
    const plan = pick(planMix);
    const opt = Math.floor(rand() * plan.prices.length * 0.999);
    return { name, plan, opt, endIn: null };
  });

  const paidMembers = [...fixed, ...rest].map((f, i) => {
    const price = f.plan.prices[Math.min(f.opt, f.plan.prices.length - 1)];
    const periodDays = daysBetween(now, addPeriod(now, price));
    const endIn = f.endIn ?? EXPIRING_WINDOW_DAYS + 1 + Math.floor(rand() * Math.max(1, periodDays - 8));
    const periodEnd = addDays(now, endIn);
    const periodStart = addPeriod(periodEnd, { ...price, interval: -price.interval });
    // Member for 1–8 periods (capped around a year and a half)
    const periodsBack = Math.min(1 + Math.floor(rand() * 8), price.unit === 'year' ? 2 : 8);
    const payments = [];
    for (let k = 0; k < periodsBack; k++) {
      payments.push({
        date: addPeriod(periodStart, { ...price, interval: -price.interval }, k),
        amount: price.amount,
        method: pick(methods),
      });
    }
    const memberSince = payments[payments.length - 1].date;
    const digits = `${pick(['9', '8', '7'])}${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`;
    const email = rand() < 0.6 ? `${f.name.split(' ')[0].toLowerCase()}${10 + (i % 80)}@gmail.com` : '';
    return {
      id: `s${i}`,
      name: f.name,
      phone: digits,
      email,
      planId: f.plan.id,
      planName: f.plan.name,
      price: { interval: price.interval, unit: price.unit, amount: price.amount },
      memberSince,
      periodStart,
      periodEnd,
      paid: true,
      payments, // newest first
    };
  });

  // Two members who joined in the last couple of days but haven't paid yet
  const pending = [
    { id: 'pend1', name: 'Dev Malhotra', phone: '9811122333', plan: gold, startIn: -1 },
    { id: 'pend2', name: 'Riya Bose', phone: '9830044556', plan: yoga, startIn: -2 },
  ].map((p) => {
    const price = p.plan.prices[0];
    const start = addDays(now, p.startIn);
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      email: '',
      planId: p.plan.id,
      planName: p.plan.name,
      price: { interval: price.interval, unit: price.unit, amount: price.amount },
      memberSince: start,
      periodStart: start,
      periodEnd: addPeriod(start, price),
      paid: false,
      payments: [],
    };
  });

  return [...paidMembers, ...pending];
}
