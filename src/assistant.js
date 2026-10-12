// The voice assistant's brain on the phone.
//
// 1. classify(text): a simple keyword version of "what did they ask?". Used
//    for the example buttons, and as a backup when the AI can't be reached.
//    (Normally Gemini does this step, via /api/ask.)
// 2. answer(intent, data): works out the answer from the app's own records.
//    AI never produces the numbers or names shown here.
//
// Every answer that could move money only offers a "Review & …" button,
// which opens the usual confirm screen. Voice never renews, sends or saves.

import { memberStatus, isActive, daysBetween, today, endsText, fmtDay, fmtWeekday, monthReport, isRazorpayPayment, startOfDay, addDays } from './membersData.js';
import { formatRupees, frequencyLabel, sortPrices } from './plansData.js';
import { linkStatus, when } from './linksData.js';

const sum = (list, f = (m) => m.price.amount) => list.reduce((s, x) => s + f(x), 0);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- Finding the member or plan they mean ---------- */

const norm = (s) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Members whose name matches what was said: full name first, then first or last name
export function findMembers(said, members) {
  const q = norm(said ?? '');
  if (!q) return [];
  const full = members.filter((m) => norm(m.name) === q);
  if (full.length) return full;
  const words = q.split(' ').filter((w) => w.length > 2);
  const scored = members
    .map((m) => {
      const parts = norm(m.name).split(' ');
      const hits = words.filter((w) => parts.includes(w)).length;
      return { m, hits };
    })
    .filter((x) => x.hits > 0);
  const best = Math.max(0, ...scored.map((x) => x.hits));
  return scored.filter((x) => x.hits === best).map((x) => x.m);
}

// The plan they mean: "yoga" → Yoga classes, "gold" or "gym" → Gold gym
export function findPlan(said, plans) {
  const q = norm(said ?? '');
  if (!q) return null;
  const exact = plans.find((p) => norm(p.name) === q);
  if (exact) return exact;
  const words = q.split(' ').filter((w) => w.length > 2 && !['plan', 'the', 'class', 'classes'].includes(w));
  return plans.find((p) => words.some((w) => norm(p.name).split(' ').some((pw) => pw.startsWith(w) || w.startsWith(pw)))) ?? null;
}

/* ---------- Dates said out loud ("11th October", "Oct 11", "yesterday") ---------- */

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Returns "YYYY-MM-DD" or ''. A date later than today means last year's.
export function parseSpokenDate(text) {
  const t = String(text ?? '').toLowerCase();
  if (/\byesterday\b/.test(t)) return toISO(addDays(today(), -1));
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
  const m1 = t.match(new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(?:of\\s*)?${mon}`));
  const m2 = t.match(new RegExp(`${mon}\\s*(\\d{1,2})(?!\\d)`));
  let day;
  let month;
  if (m1) [day, month] = [Number(m1[1]), MONTH_NAMES.indexOf(m1[2])];
  else if (m2) [day, month] = [Number(m2[2]), MONTH_NAMES.indexOf(m2[1])];
  else return '';
  if (!(day >= 1 && day <= 31) || month < 0) return '';
  const now = today();
  let d = new Date(now.getFullYear(), month, day);
  // "5th December" asked in January means last December; "20th October" asked on
  // 12 October stays this year (and is answered as "hasn't come yet")
  if (d > now && (month - now.getMonth() + 12) % 12 > 2) d = new Date(now.getFullYear() - 1, month, day);
  return toISO(d);
}
const fromISO = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

/* ---------- Keyword version of "what did they ask?" ---------- */

export function classify(text, { members = [], plans = [] } = {}) {
  const t = ` ${norm(text)} `;
  const has = (re) => re.test(t);
  const period = has(/\btoday\b/) ? 'today' : has(/\bweek\b/) ? 'week' : has(/\bmonth\b/) ? 'month' : '';
  const method = has(/\b(cash|upi|qr)\b/) ? 'cash' : has(/\b(razorpay|online|link|links)\b/) ? 'razorpay' : '';
  const plan = plans.find((p) => t.includes(` ${norm(p.name).split(' ')[0]} `));
  const planName = plan?.name ?? '';
  // A member's first or last name in the sentence (not plan words)
  const planWords = new Set(plans.flatMap((p) => norm(p.name).split(' ')));
  // Use the word that matched (e.g. "Rao"), so two members called Rao both show up
  const nameWords = norm(text)
    .split(' ')
    .filter((w) => w.length > 2 && !planWords.has(w) && members.some((m) => norm(m.name).split(' ').includes(w)));
  const memberName = nameWords.join(' ');
  const group = has(/\b(expired|lapsed)\b/) ? 'expired' : has(/\b(hasn t|haven t|not paid|unpaid|pending)\b/) ? 'unpaid' : has(/\b(expir\w*|ending|ends|due)\b/) ? 'expiring' : '';
  const date = parseSpokenDate(text);
  const base = { memberName, planName, period: date ? '' : period, method, group, date };

  if (has(/\b(create|make|new|add|start)\b.*\bplan\b/)) return { ...base, intent: 'create_plan' };
  if (has(/\b(add|enrol|enroll|register|new member|sign up|join)\b/)) return { ...base, intent: 'add_member' };
  if (has(/\b(renew|remind|send)\b/)) return { ...base, intent: 'renew' };
  if (has(/\blinks?\b/) && has(/\b(unpaid|not paid|haven t|hasn t|pending|awaiting|waiting)\b/)) return { ...base, intent: 'unpaid_links' };
  if (has(/\b(expired|lapsed|left)\b/)) return { ...base, intent: 'expired' };
  // "How much is still to come?": the renewals expected by month-end
  if (has(/\b(still to come|expected|yet to come)\b/)) return { ...base, period: 'month', intent: 'expiring' };
  if (has(/\b(expir\w*|ending|ends|due|renewals?)\b/) && !memberName) return { ...base, intent: 'expiring' };
  if (memberName) return { ...base, intent: 'member_status' };
  if (has(/\b(hasn t|haven t|not paid|didn t pay|unpaid|pending|owe|owes|dues)\b/)) return { ...base, intent: 'unpaid' };
  if (has(/\bwho paid\b|\bpaid (today|this week|recently)\b/) || (has(/\bpaid\b/) && (date || period || has(/\bhow many\b/))))
    return { ...base, intent: 'paid_recently' };
  if (has(/\b(how much|collect\w*|earn\w*|revenue|income|made|came)\b/)) return { ...base, intent: 'collected' };
  if (has(/\b(how many|members on|cost|costs|price|prices|plans?)\b/) || (planName && has(/\b(who|on)\b/)))
    return { ...base, intent: 'plan_info' };
  return { ...base, intent: 'unknown' };
}

/* ---------- Working out the answer from the records ---------- */

const memberRow = (m, right) => ({ label: `${m.name} · ${m.planName}`, value: right, memberId: m.id });

const shortEnds = (m) => {
  const left = daysBetween(today(), m.periodEnd);
  if (left === 0) return 'Today';
  if (left === 1) return 'Tomorrow';
  return endsText(m).replace(/^Ends /, '');
};
const agoText = (m) => {
  const d = daysBetween(m.periodEnd, today());
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
};

function memberSummary(m) {
  const status = memberStatus(m);
  const plan = `${m.planName} · ${frequencyLabel(m.price)} · ${formatRupees(m.price.amount)}`;
  const last = m.payments[0];
  const lastLine = last ? `Last paid ${fmtDay(last.date)} (${last.method.toLowerCase()})` : 'No payments yet';
  const link = m.linkSent ? ' · Payment link sent, not paid yet' : '';
  if (status === 'pending')
    return { title: `${m.name} hasn't made their first payment`, detail: [plan, `Started ${fmtDay(m.periodStart)}${link}`], renewable: true };
  if (status === 'expiring')
    return { title: `${m.name} hasn't renewed yet`, detail: [plan, `${endsText(m).replace('Ends', 'Expires')} · ${lastLine}${link}`], renewable: true };
  if (status === 'expired' || status === 'lapsed')
    return { title: `${m.name}'s membership expired ${agoText(m).toLowerCase()}`, detail: [plan, `${lastLine}${link}`], renewable: true };
  return { title: `${m.name} is paid up till ${fmtDay(m.periodEnd)}`, detail: [plan, lastLine], renewable: false };
}

/**
 * intent: { intent, memberName, planName, period, method, memberId? }
 * Returns { kind, asked, title, detail[], rows[], actions[], choices[], note, source }
 * Action types: renew (memberIds), resend (linkIds), list (which, view),
 * member (id), collections, links, payments (view).
 */
export function answer(intent, { members, plans, links }) {
  const kind = intent.intent;
  const base = { kind, rows: [], detail: [], actions: [], source: 'records' };

  // One named member (status, renew)
  if (kind === 'member_status' || (kind === 'renew' && (intent.memberName || intent.memberId))) {
    const found = intent.memberId ? members.filter((m) => m.id === intent.memberId) : findMembers(intent.memberName, members);
    if (found.length === 0)
      return { ...base, kind: 'not_found', title: `I couldn't find a member called "${intent.memberName}"`, detail: ['Check the name, or search in Active members.'], actions: [{ type: 'list', which: 'active', label: 'Search members' }] };
    if (found.length > 1)
      return {
        ...base,
        kind: 'choose',
        title: `Which ${intent.memberName.split(' ')[0].replace(/^\w/, (c) => c.toUpperCase())} do you mean?`,
        choices: found.slice(0, 5).map((m) => ({ id: m.id, label: `${m.name} · ${m.planName}` })),
      };
    const m = found[0];
    const s = memberSummary(m);
    if (kind === 'renew') {
      return {
        ...base,
        title: `${m.name} · ${m.planName} · ${formatRupees(m.price.amount)}`,
        detail: [memberStatus(m) === 'active' ? `Paid up till ${fmtDay(m.periodEnd)}` : s.detail[1]],
        lock: true,
        actions: [{ type: 'renew', memberIds: [m.id], label: 'Review & renew', primary: true }, { type: 'close', label: 'Cancel' }],
      };
    }
    return {
      ...base,
      title: s.title,
      detail: s.detail,
      actions: s.renewable
        ? [{ type: 'renew', memberIds: [m.id], label: 'Review & renew', primary: true }, { type: 'member', id: m.id, label: 'Open member' }]
        : [{ type: 'member', id: m.id, label: 'Open member', primary: true }, { type: 'close', label: 'Done' }],
    };
  }

  // "Renew everyone who expired" / "send links to everyone who hasn't paid"
  if (kind === 'renew' && intent.group === 'expired') return { ...answer({ ...intent, intent: 'expired' }, { members, plans, links }), lock: true };
  if (kind === 'renew' && intent.group === 'unpaid') return { ...answer({ ...intent, intent: 'unpaid' }, { members, plans, links }), lock: true };

  if (kind === 'expiring' || kind === 'renew') {
    const monthMode = intent.period === 'month';
    const todayMode = intent.period === 'today';
    const list = monthMode
      ? members.filter((m) => m.paid && m.periodEnd >= today() && m.periodEnd <= new Date(today().getFullYear(), today().getMonth() + 1, 0)).sort((a, b) => a.periodEnd - b.periodEnd)
      : todayMode
        ? members.filter((m) => m.paid && daysBetween(today(), m.periodEnd) === 0)
        : members.filter((m) => memberStatus(m) === 'expiring').sort((a, b) => a.periodEnd - b.periodEnd);
    const span = monthMode ? 'this month' : todayMode ? 'today' : 'this week';
    if (!list.length && todayMode) {
      const week = members.filter((m) => memberStatus(m) === 'expiring').length;
      return {
        ...base,
        title: 'No memberships end today',
        detail: week ? [`${plural(week, 'membership')} ${week === 1 ? 'ends' : 'end'} this week.`] : [],
        actions: week
          ? [{ type: 'reanswer', intent: { ...intent, period: 'week' }, label: 'Show this week', primary: true }, { type: 'close', label: 'Done' }]
          : [{ type: 'close', label: 'Done', primary: true }],
      };
    }
    if (!list.length) return { ...base, title: `No memberships end ${span}`, actions: [{ type: 'close', label: 'Done', primary: true }] };
    return {
      ...base,
      title: monthMode
        ? `${formatRupees(sum(list))} still to come · ${plural(list.length, 'renewal')} by ${fmtDay(new Date(today().getFullYear(), today().getMonth() + 1, 0))}`
        : `${plural(list.length, 'member')} ${list.length === 1 ? 'expires' : 'expire'} ${span} · ${formatRupees(sum(list))}`,
      rows: list.map((m) => memberRow(m, shortEnds(m))),
      // The month's renewals are days or weeks away and links last 2 days, so no bulk send for those
      selectable: !monthMode,
      lock: kind === 'renew' && !monthMode,
      actions: monthMode
        ? [{ type: 'list', which: 'due', label: 'See list', primary: true }, { type: 'close', label: 'Done' }]
        : [
            { type: 'renew', memberIds: list.map((m) => m.id), label: 'Review & send links', primary: true },
            { type: 'list', which: 'expiring', label: 'See list' },
          ],
    };
  }

  if (kind === 'expired') {
    const days = intent.period === 'today' ? 1 : intent.period === 'week' ? 7 : 30;
    const list = members
      .filter((m) => memberStatus(m) === 'expired' && daysBetween(m.periodEnd, today()) <= days)
      .sort((a, b) => b.periodEnd - a.periodEnd);
    const span = days === 1 ? 'since yesterday' : `in the last ${days} days`;
    if (!list.length) return { ...base, title: `No one has lapsed ${span}`, actions: [{ type: 'close', label: 'Done', primary: true }] };
    return {
      ...base,
      title: `${plural(list.length, 'member')} lapsed ${span} · ${formatRupees(sum(list))}`,
      rows: list.map((m) => memberRow(m, agoText(m))),
      selectable: true,
      actions: [
        { type: 'renew', memberIds: list.map((m) => m.id), label: 'Review & send links', primary: true },
        { type: 'list', which: 'expired', label: 'See list' },
      ],
    };
  }

  if (kind === 'unpaid') {
    const list = members.filter((m) => !m.paid);
    if (!list.length) return { ...base, title: "Everyone's paid up", detail: ['No members are waiting to make their first payment.'], actions: [{ type: 'close', label: 'Done', primary: true }] };
    return {
      ...base,
      title: `${plural(list.length, 'member')} ${list.length === 1 ? "hasn't" : "haven't"} paid · ${formatRupees(sum(list))}`,
      rows: list.map((m) => memberRow(m, formatRupees(m.price.amount))),
      selectable: true,
      actions: [
        { type: 'renew', memberIds: list.map((m) => m.id), label: 'Review & send links', primary: true },
        { type: 'list', which: 'active', view: { filter: 'pending' }, label: 'See list' },
      ],
    };
  }

  // Money questions, for a time window: a day ("on 11 Oct", "today", "yesterday"),
  // the last 7 days, or this month so far (the default)
  if (kind === 'collected' || kind === 'paid_recently') {
    const now = today();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthName = now.toLocaleDateString('en-IN', { month: 'long' });
    const day = intent.date ? fromISO(intent.date) : intent.period === 'today' ? now : null;
    if (day && day > now) return { ...base, title: "That date hasn't come yet", detail: ['Ask about a day up to today.'], actions: [{ type: 'close', label: 'Done', primary: true }] };
    const win = day
      ? { from: day, to: day, label: daysBetween(day, now) === 0 ? `today (${fmtDay(day)})` : daysBetween(day, now) === 1 ? `yesterday (${fmtDay(day)})` : `on ${fmtWeekday(day)}`, kind: 'day' }
      : intent.period === 'week' || kind === 'paid_recently'
        ? { from: addDays(now, -6), to: now, label: 'in the last 7 days', kind: 'week' }
        : { from: monthStart, to: now, label: `so far in ${monthName}`, kind: 'month' };
    const plan = findPlan(intent.planName, plans);
    const isRz = intent.method === 'razorpay';
    const all = members
      .flatMap((m) => m.payments.map((p) => ({ member: m, payment: p })))
      .filter((x) => {
        const d = startOfDay(x.payment.date);
        return d >= win.from && d <= win.to;
      })
      .sort((a, b) => b.payment.date - a.payment.date);
    const list = all.filter(
      (x) => (!plan || (x.payment.planName ?? x.member.planName) === plan.name) && (!intent.method || isRazorpayPayment(x.payment) === isRz),
    );
    const total = sum(list, (x) => x.payment.amount);
    const rz = sum(list.filter((x) => isRazorpayPayment(x.payment)), (x) => x.payment.amount);
    const what = intent.method ? (isRz ? 'came via Razorpay' : 'came as cash or UPI') : plan ? `from ${plan.name}` : 'collected';
    // The payments page shows this month, so only offer it for windows inside this month
    const inMonth = win.from >= monthStart;
    const actions = inMonth
      ? [{ type: 'payments', view: { plan: plan?.name ?? null, source: intent.method ? (isRz ? 'razorpay' : 'recorded') : 'all' }, label: 'See payments', primary: true }, { type: 'close', label: 'Done' }]
      : [{ type: 'close', label: 'Done', primary: true }];
    if (!list.length) return { ...base, title: `No payments ${win.label}`, detail: plan || intent.method ? [`Nothing ${what} ${win.label}.`] : [], actions };

    // "Who paid…" lists the people; "how much…" leads with the money
    if (kind === 'paid_recently') {
      return {
        ...base,
        title: `${plural(list.length, 'payment')} ${win.label} · ${formatRupees(total)}`,
        rows: list.map((x) => ({ label: `${x.member.name} · ${fmtDay(x.payment.date)}`, value: formatRupees(x.payment.amount), memberId: x.member.id })),
        actions,
      };
    }
    const r = win.kind === 'month' && !plan && !intent.method ? monthReport(members) : null;
    return {
      ...base,
      title: `${formatRupees(total)} ${what} ${win.label}`,
      detail: [
        `${plural(list.length, 'payment')}${intent.method ? ` · ${isRz ? 'verified by Razorpay' : 'recorded by you'}` : ''}`,
        ...(r && r.change !== null ? [`${r.change >= 0 ? '↑' : '↓'} ${Math.abs(r.change)}% vs same time last month`] : []),
      ],
      split: intent.method ? null : { razorpay: rz, recorded: total - rz },
      // A day or a week: show who paid
      rows: win.kind === 'month' ? [] : list.map((x) => ({ label: `${x.member.name} · ${x.payment.planName ?? x.member.planName}`, value: formatRupees(x.payment.amount), memberId: x.member.id })),
      actions: win.kind === 'month' && !plan && !intent.method ? [{ type: 'collections', label: 'See collections', primary: true }, { type: 'close', label: 'Done' }] : actions,
    };
  }

  if (kind === 'plan_info') {
    const plan = findPlan(intent.planName, plans);
    const on = (p) => members.filter((m) => m.planId === p.id && (isActive(m) || !m.paid));
    if (plan) {
      const list = on(plan);
      return {
        ...base,
        title: `${plural(list.length, 'member')} on ${plan.name}`,
        rows: sortPrices(plan.prices).map((pr) => ({
          label: `${frequencyLabel(pr)} · ${formatRupees(pr.amount)}`,
          value: String(list.filter((m) => m.price.interval === pr.interval && m.price.unit === pr.unit).length),
        })),
        actions: [{ type: 'list', which: 'active', view: { plan: plan.name }, label: 'See members', primary: true }, { type: 'close', label: 'Done' }],
      };
    }
    return {
      ...base,
      title: `${plural(plans.length, 'plan')}`,
      rows: plans.map((p) => ({ label: `${p.name} · from ${formatRupees(Math.min(...p.prices.map((x) => x.amount)))}`, value: plural(on(p).length, 'member') })),
      actions: [{ type: 'plans', label: 'See plans', primary: true }, { type: 'close', label: 'Done' }],
    };
  }

  if (kind === 'unpaid_links') {
    const list = links.filter((l) => linkStatus(l) === 'awaiting');
    if (!list.length) return { ...base, source: 'links', title: 'No links are waiting for payment', actions: [{ type: 'links', label: 'See links', primary: true }, { type: 'close', label: 'Done' }] };
    return {
      ...base,
      source: 'links',
      title: `${plural(list.length, 'link')} awaiting payment · ${formatRupees(sum(list, (l) => l.amount))}`,
      rows: list.map((l) => ({ label: `${l.memberName} · sent ${when(l.sentAt)}`, value: formatRupees(l.amount), memberId: l.memberId })),
      actions: [{ type: 'resend', linkIds: list.map((l) => l.id), label: 'Review & resend', primary: true }, { type: 'links', label: 'See links' }],
    };
  }

  if (kind === 'query' && intent.query) return runQuery(intent.query, { members, plans, links });

  return {
    ...base,
    kind: 'unknown',
    title: "I can't help with that yet",
    detail: ['I can answer questions about members, plans, renewals, payment links and money, or add a member or plan.'],
  };
}

/* ---------- Any other question: run the lookup Gemini described ---------- */

const BILLING = { weekly: [1, 'week'], monthly: [1, 'month'], quarterly: [3, 'month'], 'half-yearly': [6, 'month'], yearly: [1, 'year'] };
const isBilling = (price, b) => {
  const [n, unit] = BILLING[b] ?? [];
  return price.unit === unit && Number(price.interval) === n || (b === 'yearly' && price.unit === 'month' && Number(price.interval) === 12);
};
const methodMatch = (p, m) => {
  const rz = isRazorpayPayment(p);
  if (m === 'razorpay') return rz;
  if (m === 'recorded') return !rz;
  return new RegExp(m, 'i').test(p.method);
};
// "13 Sep", or "25 Dec 2024" when it's not this year
const dayText = (d) => (new Date(d).getFullYear() === new Date().getFullYear() ? fmtDay(d) : `${fmtDay(d)} ${new Date(d).getFullYear()}`);
const STATUS_WORD = { active: 'Active', expiring: 'Ending soon', expired: 'Expired', lapsed: 'Lapsed', pending: 'Payment pending' };
const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function runQuery(q, { members, plans, links }) {
  const base = { kind: 'query', rows: [], detail: [], source: q.entity === 'links' ? 'links' : 'records' };
  const plan = findPlan(q.planName, plans);
  const named = q.memberName ? findMembers(q.memberName, members) : null;
  if (named && named.length === 0) return { ...base, kind: 'not_found', title: `I couldn't find a member called "${q.memberName}"`, actions: [{ type: 'list', which: 'active', label: 'Search members' }] };
  const from = q.dateFrom ? fromISO(q.dateFrom) : null;
  const to = q.dateTo ? fromISO(q.dateTo) : null;
  const inRange = (d) => (!from || startOfDay(d) >= from) && (!to || startOfDay(d) <= to);
  const range = from || to ? ` · ${from ? fmtDay(from) : '…'} – ${to ? fmtDay(to) : 'today'}` : '';

  // 1. The records, as { name, memberId, plan, amount, date, method, status, billing }
  let items = [];
  if (q.entity === 'payments') {
    items = members.flatMap((m) =>
      m.payments.map((p) => ({ name: m.name, memberId: m.id, plan: p.planName ?? m.planName, amount: p.amount, date: p.date, method: p.method, status: memberStatus(m), billing: m.price, member: m, payment: p })),
    );
    items = items.filter((x) => inRange(x.date) && (!q.method || methodMatch(x.payment, q.method)));
  } else if (q.entity === 'links') {
    items = links.map((l) => ({ name: l.memberName, memberId: l.memberId, plan: l.plan?.planName ?? '', amount: l.amount, date: new Date(l.sentAt), method: 'payment link', status: linkStatus(l), link: l }));
    items = items.filter((x) => inRange(x.date) && (!q.linkStatus || x.status === q.linkStatus));
  } else if (q.entity === 'plans') {
    items = plans.map((p) => {
      const on = members.filter((m) => m.planId === p.id && (isActive(m) || !m.paid));
      return { name: p.name, plan: p.name, amount: Math.min(...p.prices.map((x) => x.amount)), count: on.length, date: null, planObj: p };
    });
  } else {
    const dateOf = (m) => (q.dateField === 'membership_start' ? m.periodStart : q.dateField === 'member_since' ? m.memberSince : m.periodEnd);
    items = members.map((m) => ({ name: m.name, memberId: m.id, plan: m.planName, amount: m.price.amount, date: dateOf(m), status: memberStatus(m), billing: m.price, member: m }));
    items = items.filter((x) => inRange(x.date));
    if (q.status === 'paid_up') items = items.filter((x) => x.status === 'active' || x.status === 'expiring');
    else if (q.status) items = items.filter((x) => x.status === q.status);
  }
  // 2. Shared filters
  if (plan) items = items.filter((x) => x.plan === plan.name);
  if (named) items = items.filter((x) => named.some((m) => m.id === x.memberId));
  if (q.billing && q.entity !== 'plans' && q.entity !== 'links') items = items.filter((x) => x.billing && isBilling(x.billing, q.billing));
  if (q.minAmount != null) items = items.filter((x) => x.amount >= q.minAmount);
  if (q.maxAmount != null) items = items.filter((x) => x.amount <= q.maxAmount);

  // Sensible default order: newest money first; members A–Z (or by the date asked about)
  if (!q.sortBy && !q.groupBy) {
    if (q.entity === 'payments' || q.entity === 'links') items.sort((a, b) => new Date(b.date) - new Date(a.date));
    else if (q.entity === 'members' && q.dateField) items.sort((a, b) => new Date(a.date) - new Date(b.date));
    else items.sort((a, b) => a.name.localeCompare(b.name));
  }
  const isMoney = q.entity === 'payments' || q.entity === 'links';
  const heading = q.label || 'Here’s what I found';
  const money = (n) => formatRupees(Math.round(n));
  const done = [{ type: 'close', label: 'Done', primary: true }];
  if (!items.length) return { ...base, title: `${heading}: none`, detail: [`Nothing matches${range ? ` (${range.slice(3)})` : ''}.`], actions: done };

  // 3. Groups ("by plan", "each month")
  if (q.groupBy) {
    const keyOf = (x) =>
      q.groupBy === 'plan' ? x.plan
      : q.groupBy === 'method' ? (x.payment ? (isRazorpayPayment(x.payment) ? 'Via Razorpay' : 'Cash/UPI') : x.method)
      : q.groupBy === 'month' ? (x.date ? `${MONTHS3[new Date(x.date).getMonth()]} ${new Date(x.date).getFullYear()}` : '—')
      : q.groupBy === 'billing' ? (x.billing ? frequencyLabel(x.billing) : '—')
      : STATUS_WORD[x.status] ?? x.status;
    const groups = {};
    for (const x of items) {
      const k = keyOf(x);
      groups[k] ??= { key: k, count: 0, sum: 0, first: x.date };
      groups[k].count += 1;
      groups[k].sum += x.amount;
    }
    const valueOf = (g) => (q.metric === 'count' || q.metric === 'list' ? g.count : q.metric === 'average' ? g.sum / g.count : g.sum);
    let rows = Object.values(groups);
    if (q.groupBy === 'month') rows.sort((a, b) => new Date(a.first) - new Date(b.first));
    else rows.sort((a, b) => valueOf(b) - valueOf(a));
    if (q.sortDir === 'asc' && q.groupBy !== 'month') rows.reverse();
    if (q.limit) rows = rows.slice(0, q.limit);
    const show = (g) => (q.metric === 'count' || q.metric === 'list' ? plural(g.count, q.entity === 'payments' ? 'payment' : q.entity === 'links' ? 'link' : 'member') : money(valueOf(g)));
    return {
      ...base,
      title: rows.length === 1 && q.limit === 1 ? `${heading}: ${rows[0].key}` : heading,
      detail: [`${plural(items.length, q.entity === 'payments' ? 'payment' : q.entity === 'links' ? 'link' : q.entity === 'plans' ? 'plan' : 'member')}${isMoney ? ` · ${money(sum(items, (x) => x.amount))}` : ''}${range}`],
      rows: rows.map((g) => ({ label: g.key, value: show(g) })),
      actions: done,
    };
  }

  // 4. One number
  const total = sum(items, (x) => x.amount);
  const noun = q.entity === 'payments' ? 'payment' : q.entity === 'links' ? 'link' : q.entity === 'plans' ? 'plan' : 'member';
  if (q.metric === 'count') return { ...base, title: `${heading}: ${items.length}`, detail: [`${plural(items.length, noun)}${isMoney ? ` · ${money(total)}` : ''}${range}`], rows: listRows(items.slice(0, 50), q), actions: done };
  if (q.metric === 'sum') return { ...base, title: `${heading}: ${money(total)}`, detail: [`${plural(items.length, noun)}${range}`], rows: listRows(items.slice(0, 50), q), actions: done };
  if (q.metric === 'average') return { ...base, title: `${heading}: ${money(total / items.length)}`, detail: [`Average of ${plural(items.length, noun)}${range}`], actions: done };

  // 5. A list (max/min = the top one by amount)
  let list = [...items];
  const sortBy = q.metric === 'max' || q.metric === 'min' ? 'amount' : q.sortBy;
  const dir = q.metric === 'min' ? 'asc' : q.metric === 'max' ? 'desc' : q.sortDir || (sortBy === 'name' ? 'asc' : 'desc');
  const cmp = {
    amount: (a, b) => a.amount - b.amount,
    date: (a, b) => new Date(a.date ?? 0) - new Date(b.date ?? 0),
    name: (a, b) => a.name.localeCompare(b.name),
    count: (a, b) => (a.count ?? 0) - (b.count ?? 0),
  }[sortBy];
  if (cmp) list.sort((a, b) => (dir === 'asc' ? cmp(a, b) : cmp(b, a)));
  const limit = q.metric === 'max' || q.metric === 'min' ? 1 : q.limit;
  if (limit) list = list.slice(0, limit);
  const one = list.length === 1 && limit === 1;
  return {
    ...base,
    title: one ? `${heading}: ${list[0].name}` : `${heading} · ${plural(items.length, noun)}`,
    detail: [one ? describe(list[0], q) : `${isMoney ? `Total ${money(total)}` : ''}${range}`.replace(/^ · /, '')].filter(Boolean),
    rows: one ? [] : listRows(list, q),
    actions: one && list[0].memberId ? [{ type: 'member', id: list[0].memberId, label: 'Open member', primary: true }, { type: 'close', label: 'Done' }] : done,
  };
}

// One line per record, with the most useful value on the right
function listRows(list, q) {
  return list.map((x) => {
    if (q.entity === 'plans') return { label: `${x.name} · from ${formatRupees(x.amount)}`, value: plural(x.count, 'member') };
    if (q.entity === 'payments') return { label: `${x.name} · ${dayText(x.date)}`, value: formatRupees(x.amount), memberId: x.memberId };
    if (q.entity === 'links') return { label: `${x.name} · ${x.status}`, value: formatRupees(x.amount), memberId: x.memberId };
    const right =
      q.dateField === 'member_since' ? `Since ${dayText(x.date)}`
      : q.dateField === 'membership_start' ? `From ${dayText(x.date)}`
      : x.status === 'pending' ? 'Not paid yet'
      : endsText(x.member).replace(/^Ends /, x.status === 'expired' || x.status === 'lapsed' ? 'Ended ' : 'Ends ');
    return { label: `${x.name} · ${x.plan}`, value: right, memberId: x.memberId };
  });
}
function describe(x, q) {
  if (q.entity === 'payments') return `${formatRupees(x.amount)} on ${dayText(x.date)} · ${x.plan} · ${x.method}`;
  if (q.entity === 'plans') return `${plural(x.count, 'member')} · from ${formatRupees(x.amount)}`;
  if (q.entity === 'links') return `${formatRupees(x.amount)} · ${x.status}`;
  return `${x.plan} · ${frequencyLabel(x.member.price)} · ${formatRupees(x.amount)} · member since ${dayText(x.member.memberSince)}`;
}
