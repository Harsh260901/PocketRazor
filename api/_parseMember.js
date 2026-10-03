// Turns what the merchant said ("Add Meera Iyer, 99887 76655, yoga monthly,
// she paid cash") into New member form fields, using Gemini.
// The browser sends the merchant's current plans along with the words, so
// the AI can only pick a plan (and billing option) that actually exists.

import { askGemini } from './_gemini.js';

const UNITS = ['week', 'month', 'year'];
const DAYS = { week: 7, month: 30, year: 360 };
const sameFrequency = (a, b) => a.interval * DAYS[a.unit] === b.interval * DAYS[b.unit];

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: "Member's full name. Empty string if not said." },
    phone: { type: 'STRING', description: 'Phone number digits only. Empty string if not said.' },
    email: { type: 'STRING', description: 'Email address. Empty string if not said.' },
    planSaid: { type: 'STRING', description: 'The words the merchant used for the plan. Empty string if none.' },
    planId: { type: 'STRING', description: 'id of the matching plan from the list, or empty string.' },
    billingInterval: { type: 'INTEGER', nullable: true },
    billingUnit: { type: 'STRING', enum: UNITS, nullable: true },
    startDate: { type: 'STRING', description: 'YYYY-MM-DD, or empty string if not said.' },
    alreadyPaid: { type: 'BOOLEAN' },
  },
  required: ['name', 'phone', 'email', 'planSaid', 'planId', 'billingInterval', 'billingUnit', 'startDate', 'alreadyPaid'],
};

// Today's date in India, e.g. "Friday, 2026-10-02"
function todayInIndia() {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const weekday = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
  return `${weekday}, ${date}`;
}

function describeOption(p) {
  return `every ${p.interval} ${p.unit}${p.interval > 1 ? 's' : ''} for ₹${p.amount}`;
}

function buildInstructions(plans) {
  const list = plans
    .map((p) => `- id "${p.id}": "${p.name}" (options: ${p.prices.map(describeOption).join('; ')})`)
    .join('\n');
  return `You fill in a "New member" form for a small Indian business (gym, studio, classes) on Razorpay.
The merchant describes a new member in their own words, often transcribed speech, so expect small transcription errors.
Today is ${todayInIndia()}.

The merchant's plans:
${list || '(none)'}

Extract:
- name: the member's full name in Title Case. Empty string if not said.
- phone: digits only, as spoken. Indian speakers say "double nine" for 99 and "triple eight" for 888. Drop "+91" or a leading 0. Empty string if not said.
- email: only if said ("meera at gmail dot com" = meera@gmail.com). Empty string otherwise.
- planSaid: the words used for the plan, e.g. "yoga".
- planId: the id of the plan from the list above that the merchant clearly means ("yoga" = "Yoga classes", "gym" = a gym plan if there is exactly one). Empty string if no plan matches or it's unclear. Never invent an id.
- billingInterval and billingUnit: the billing option the merchant said, and only if it's one of that plan's options. Monthly = 1 month, quarterly = 3 months, half-yearly = 6 months, yearly = 1 year. If the plan has exactly one option and none was said, use that one. Otherwise null.
- startDate: when the membership starts, as YYYY-MM-DD ("today", "tomorrow", "from Monday", "5th October"). Empty string if not said.
- alreadyPaid: true only if the merchant says the member has already paid (cash, UPI, "paid at the counter"). Otherwise false.
Never make up details the merchant didn't say.`;
}

// Only trust plans in the shape we expect (they come from the browser)
function cleanPlans(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).flatMap((p) => {
    if (typeof p?.id !== 'string' || typeof p?.name !== 'string' || !Array.isArray(p?.prices)) return [];
    const prices = p.prices
      .filter((x) => UNITS.includes(x?.unit) && Number.isInteger(x?.interval) && x.interval > 0 && Number(x?.amount) > 0)
      .slice(0, 10)
      .map((x) => ({ interval: x.interval, unit: x.unit, amount: Number(x.amount) }));
    return prices.length ? [{ id: p.id.slice(0, 40), name: p.name.slice(0, 60), prices }] : [];
  });
}

// Never trust the AI's output blindly
function sanitize(raw, plans) {
  const str = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
  const plan = plans.find((p) => p.id === raw?.planId) ?? null;

  let billing = null;
  if (plan && UNITS.includes(raw?.billingUnit) && Number.isInteger(raw?.billingInterval)) {
    const said = { interval: raw.billingInterval, unit: raw.billingUnit };
    const match = plan.prices.find((p) => sameFrequency(p, said));
    if (match) billing = { interval: match.interval, unit: match.unit };
  }
  if (plan && !billing && plan.prices.length === 1) {
    billing = { interval: plan.prices[0].interval, unit: plan.prices[0].unit };
  }

  const email = str(raw?.email, 100).toLowerCase();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(raw?.startDate ?? '') ? raw.startDate : '';

  return {
    name: str(raw?.name, 60),
    phone: str(raw?.phone, 20).replace(/\D/g, ''),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    planSaid: str(raw?.planSaid, 40),
    planId: plan ? plan.id : '',
    billing,
    startDate,
    alreadyPaid: raw?.alreadyPaid === true,
  };
}

/** Shared request handler for the Vercel function and the local dev server. */
export async function handleParseMember({ method, body, env }) {
  if (method !== 'POST') return { status: 405, json: { error: 'Use POST.' } };
  const plans = cleanPlans(body?.plans);
  const result = await askGemini({
    env,
    instructions: buildInstructions(plans),
    schema: RESPONSE_SCHEMA,
    text: body?.text,
  });
  if (!result.ok) return { status: result.status, json: result.json };
  return { status: 200, json: sanitize(result.data, plans) };
}
