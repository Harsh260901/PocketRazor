// The voice assistant's "what did they ask?" step.
//
// Gemini only works out WHAT the merchant asked (the intent, plus any member
// name, plan, time period or payment method they mentioned). It never sees
// the merchant's members or money, and it never answers with numbers: the
// app computes every answer from its own records. For "add a member" and
// "create a plan", this also fills in the form (same as the voice forms).
//
// Runs on the server only, so the Gemini key never reaches the browser.

import { askGemini } from './_gemini.js';
import { handleParseMember } from './_parseMember.js';
import { handleParsePlan } from './_parsePlan.js';

export const INTENTS = [
  'expiring', // who's expiring / due this week or month
  'expired', // who has lapsed recently
  'unpaid', // who hasn't paid (members whose payment is pending)
  'member_status', // has <name> paid? which plan is <name> on? when does <name> expire?
  'collected', // how much did I collect (optionally: by cash / via Razorpay / from a plan)
  'paid_recently', // who paid today / this week
  'plan_info', // how many members on <plan>? what does <plan> cost?
  'unpaid_links', // which payment links haven't been paid?
  'renew', // renew <name> / send <name> a link / send links to everyone expiring
  'add_member', // add a new member
  'create_plan', // create a new plan
  'query', // any other question about members, payments, plans or links (see QUERY below)
  'unknown', // not about the business at all
];

// For any other question, Gemini describes a lookup ("which records, which
// filters, what to calculate"). The app runs it on its own records, so the
// numbers and names always come from the app, never from the AI.
const s = (description) => ({ type: 'STRING', description });
// Gemini doesn't allow empty strings in a list of choices, so "none" means not said
const e = (values, description) => ({ type: 'STRING', enum: values.map((v) => v || 'none'), description: description || 'Choose one' });
const QUERY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    entity: e(['members', 'payments', 'links', 'plans'], 'What to look through'),
    metric: e(['list', 'count', 'sum', 'average', 'max', 'min'], 'What to work out (sum/average/max/min use the amount)'),
    memberName: s('Only this member (name as said). Empty string for all.'),
    planName: s('Only this plan (as said). Empty string for all.'),
    status: e(['', 'paid_up', 'active', 'expiring', 'expired', 'lapsed', 'pending'], 'Members: membership status'),
    method: e(['', 'razorpay', 'recorded', 'cash', 'upi', 'card'], 'Payments: how it was paid'),
    billing: e(['', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'], 'Billing option'),
    linkStatus: e(['', 'awaiting', 'paid', 'expired'], 'Links: status'),
    dateField: e(['', 'payment_date', 'membership_end', 'membership_start', 'member_since', 'link_sent'], 'Which date the date range applies to'),
    dateFrom: s('YYYY-MM-DD or empty string'),
    dateTo: s('YYYY-MM-DD or empty string'),
    minAmount: { type: 'NUMBER', nullable: true },
    maxAmount: { type: 'NUMBER', nullable: true },
    groupBy: e(['', 'plan', 'method', 'month', 'billing', 'status'], 'Split the result into groups'),
    sortBy: e(['', 'date', 'amount', 'name', 'count'], 'Order of results'),
    sortDir: e(['', 'asc', 'desc'], ''),
    limit: { type: 'INTEGER', nullable: true },
    label: s('A short heading for the answer in plain words, e.g. "Cash payments in September". No numbers.'),
  },
  required: ['entity', 'metric', 'memberName', 'planName', 'status', 'method', 'billing', 'linkStatus', 'dateField', 'dateFrom', 'dateTo', 'minAmount', 'maxAmount', 'groupBy', 'sortBy', 'sortDir', 'limit', 'label'],
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: INTENTS },
    memberName: { type: 'STRING', description: 'Member name mentioned, as said. Empty string if none.' },
    planName: { type: 'STRING', description: 'Plan mentioned, as said (e.g. "yoga", "gold gym"). Empty string if none.' },
    period: { type: 'STRING', enum: ['today', 'week', 'month', 'none'] },
    method: { type: 'STRING', enum: ['cash', 'razorpay', 'none'] },
    group: { type: 'STRING', enum: ['expiring', 'expired', 'unpaid', 'none'] },
    date: { type: 'STRING', description: 'A specific day mentioned, as YYYY-MM-DD. Empty string if none.' },
    query: { ...QUERY_SCHEMA, nullable: true },
  },
  required: ['intent', 'memberName', 'planName', 'period', 'method', 'group', 'date', 'query'],
};

// Today's date in India, e.g. "Monday, 2026-10-12" (so "yesterday" and "11th October" can be turned into dates)
const todayInIndia = () => {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const weekday = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
  return `${weekday}, ${date}`;
};

const INSTRUCTIONS = () => `Today is ${todayInIndia()}.
You are the voice assistant inside the Memberships product of the Razorpay app, used by small Indian gyms and studios.
The merchant asks a question or gives an instruction, often as transcribed speech with small errors.
Classify it into exactly one intent:
- expiring: whose membership is ending / due / expiring soon, this week or this month.
- expired: whose membership has already expired or lapsed.
- unpaid: who hasn't paid, who owes money, pending payments (no specific member named).
- member_status: a question about one named member: have they paid, which plan are they on, when do they expire.
- collected: how much money came in / was collected / earned (this month by default). Includes "how much came by cash", "how much via Razorpay", "how much from yoga".
- paid_recently: who paid today / this week / recently.
- plan_info: how many members are on a plan, what a plan costs, which plans exist.
- unpaid_links: which payment links haven't been paid, link status.
- renew: an instruction to renew someone or send them a payment link or reminder ("renew Rahul", "send links to everyone expiring this week").
- query: ANY other question about the merchant's members, payments, plans or payment links that the intents above don't cover exactly, in any wording. For example: "which plan earns the most", "who has been with me the longest", "how many people are on yearly billing", "average payment this month", "whose membership ends in November", "how much has Rahul paid in total", "who paid by card", "biggest payment last month". Fill the query object.
- add_member: add / enrol / register a new member.
- create_plan: create / add / make a new plan.
- unknown: anything else, including questions unrelated to the business.
Also extract:
- memberName: the member's name exactly as said, or empty string.
- planName: the plan as said, or empty string.
- period: "today", "week" or "month" if a time period is said, else "none".
- method: "cash" for cash/UPI/QR paid to the owner, "razorpay" for payment links/Razorpay/online, else "none".
- date: if a specific day is mentioned ("11th October", "Oct 5", "yesterday"), that day as YYYY-MM-DD (this year, or last year if that date hasn't come yet this year). Empty string otherwise. Use period instead for "today", "this week", "this month".
- query: only for intent "query", otherwise null. Describe the lookup:
  entity: members (people, their plan, status and dates; amount = their plan price), payments (money received; amount = payment), links (Razorpay payment links sent), plans.
  metric: list (show the records), count, sum, average, max, min (of amount). "Who/which" questions are usually list; "how many" count; "how much" sum.
  Filters: memberName, planName, status (paid_up = active or ending within 7 days; expiring = ends within 7 days; expired = ended in the last 30 days; lapsed = ended over 30 days ago; pending = joined but hasn't paid), method (razorpay = paid through a payment link; recorded = cash or UPI the owner noted; cash, upi, card), billing, linkStatus, amount range.
  Dates: dateField says which date (payment_date for payments, membership_end / membership_start / member_since for members, link_sent for links) and dateFrom / dateTo as YYYY-MM-DD ("last month" = the whole previous calendar month; "this month" = 1st of this month to today; "November" = 1–30 Nov). Leave empty for all time.
  groupBy to split results ("by plan", "each month"); sortBy + sortDir + limit for "top", "biggest", "longest", "latest" (e.g. longest member: entity members, sortBy date, dateField member_since, sortDir asc, limit 1).
  label: a short plain heading, no numbers.
- group: for renew instructions about a group, which group: "expiring" (ending soon / today / this week), "expired" (already expired or lapsed), "unpaid" (haven't paid yet). Else "none".
In the query object, use "none" for any choice that doesn't apply, and empty strings for names and dates that weren't said.
Never answer the question yourself and never invent names or numbers.`;

const str = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

// Keep only well-formed lookup fields (never trust the AI's output blindly)
function out0Query(raw) {
  if (raw?.intent !== 'query' || !raw.query || typeof raw.query !== 'object') return null;
  const q = raw.query;
  const pick = (v, allowed) => (allowed.includes(v) ? v : '');
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : '');
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  return {
    entity: pick(q.entity, ['members', 'payments', 'links', 'plans']) || 'members',
    metric: pick(q.metric, ['list', 'count', 'sum', 'average', 'max', 'min']) || 'list',
    memberName: str(q.memberName, 60),
    planName: str(q.planName, 60),
    status: pick(q.status, ['paid_up', 'active', 'expiring', 'expired', 'lapsed', 'pending']),
    method: pick(q.method, ['razorpay', 'recorded', 'cash', 'upi', 'card']),
    billing: pick(q.billing, ['weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly']),
    linkStatus: pick(q.linkStatus, ['awaiting', 'paid', 'expired']),
    dateField: pick(q.dateField, ['payment_date', 'membership_end', 'membership_start', 'member_since', 'link_sent']),
    dateFrom: date(q.dateFrom),
    dateTo: date(q.dateTo),
    minAmount: num(q.minAmount),
    maxAmount: num(q.maxAmount),
    groupBy: pick(q.groupBy, ['plan', 'method', 'month', 'billing', 'status']),
    sortBy: pick(q.sortBy, ['date', 'amount', 'name', 'count']),
    sortDir: pick(q.sortDir, ['asc', 'desc']),
    limit: Number.isInteger(q.limit) && q.limit > 0 ? Math.min(q.limit, 100) : null,
    label: str(q.label, 80),
  };
}

export async function handleAsk({ method, body, env }) {
  if (method !== 'POST') return { status: 405, json: { error: 'Use POST.' } };
  let result = await askGemini({ env, instructions: INSTRUCTIONS(), schema: RESPONSE_SCHEMA, text: body?.text });
  // Safety net: if Gemini ever refuses the detailed lookup format, ask again
  // without it (the common questions and commands still work)
  if (!result.ok && result.status === 500 && /rejected/i.test(result.json?.error ?? '')) {
    const { query, ...simpler } = RESPONSE_SCHEMA.properties;
    result = await askGemini({
      env,
      instructions: INSTRUCTIONS(),
      schema: { ...RESPONSE_SCHEMA, properties: simpler, required: RESPONSE_SCHEMA.required.filter((k) => k !== 'query') },
      text: body?.text,
    });
  }
  if (!result.ok) return { status: result.status, json: result.json };

  const raw = result.data ?? {};
  const out = {
    intent: INTENTS.includes(raw.intent) ? raw.intent : 'unknown',
    memberName: str(raw.memberName, 60),
    planName: str(raw.planName, 60),
    period: ['today', 'week', 'month'].includes(raw.period) ? raw.period : '',
    method: ['cash', 'razorpay'].includes(raw.method) ? raw.method : '',
    group: ['expiring', 'expired', 'unpaid'].includes(raw.group) ? raw.group : '',
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date ?? '') ? raw.date : '',
    query: out0Query(raw),
  };

  // Commands: fill in the form straight away (the owner still reviews and saves it)
  if (out.intent === 'add_member') {
    const filled = await handleParseMember({ method: 'POST', body: { text: body.text, plans: body.plans }, env });
    if (filled.status === 200) out.fields = filled.json;
  } else if (out.intent === 'create_plan') {
    const filled = await handleParsePlan({ method: 'POST', body: { text: body.text }, env });
    if (filled.status === 200) out.fields = filled.json;
  }
  return { status: 200, json: out };
}
