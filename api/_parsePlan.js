// Turns what the merchant said ("Zumba, 1200 a month, 3000 a quarter")
// into plan fields, using Google's Gemini.
//
// This file only ever runs on the server: on Vercel as part of the
// /api/parse-plan function, or inside the local dev server. It is never
// sent to the browser, so the API key it reads stays secret.
//
// (Files in /api that start with "_" are helpers; Vercel doesn't expose
// them as their own URLs.)

import { askGemini } from './_gemini.js';

const MAX_OPTIONS = 6;
const UNITS = ['week', 'month', 'year'];

// The shape we ask Gemini to answer in (Gemini's "structured output")
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Plan name. Empty string if not mentioned.' },
    description: { type: 'STRING', description: 'Short plan description. Empty string if not mentioned.' },
    prices: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          interval: { type: 'INTEGER', description: 'How many units between charges, e.g. 3 for quarterly.' },
          unit: { type: 'STRING', enum: UNITS },
          amount: { type: 'NUMBER', nullable: true, description: 'Price in rupees. null if not mentioned.' },
        },
        required: ['interval', 'unit', 'amount'],
      },
    },
  },
  required: ['name', 'description', 'prices'],
};

const INSTRUCTIONS = `You fill in a membership plan form for a small Indian business on Razorpay.
The merchant describes the plan in their own words (often transcribed speech, so expect small transcription errors).
Extract:
- name: the plan's name, in Title Case, without words like "plan" or "membership" unless they are part of the name. Empty string if no name is given.
- description: only if the merchant describes what the plan includes. Empty string otherwise. Never invent one.
- prices: one entry per billing option. Convert periods like this: weekly = 1 week, monthly = 1 month, quarterly / every three months = 3 months, half-yearly / six months = 6 months, yearly / annual = 1 year. Two years = 2 years.
  Amounts are in Indian rupees. Convert spoken numbers: "fifteen hundred" = 1500, "1.5k" = 1500, "one lakh" = 100000, "twelve ninety nine" = 1299.
  If a billing period is mentioned without a price, include it with amount null. If a price is mentioned without a period, assume monthly.
Never make up a name, price or period the merchant didn't say.`;

const clean = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

// Never trust the AI's output blindly: keep only well-formed values
function sanitize(raw) {
  const days = { week: 7, month: 30, year: 360 };
  const seen = new Set();
  const prices = (Array.isArray(raw?.prices) ? raw.prices : [])
    .map((p) => {
      const interval = Math.round(Number(p?.interval));
      const amount = p?.amount == null ? null : Math.round(Number(p.amount) * 100) / 100;
      return {
        interval,
        unit: p?.unit,
        amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      };
    })
    // Drop malformed options rather than guessing
    .filter((p) => UNITS.includes(p.unit) && Number.isInteger(p.interval) && p.interval >= 1 && p.interval <= 52)
    // Drop repeats of the same frequency (12 months = 1 year)
    .filter((p) => {
      const key = p.interval * days[p.unit];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OPTIONS);
  return { name: clean(raw?.name, 60), description: clean(raw?.description, 200), prices };
}

/**
 * Shared request handler. Returns { status, json } so it can be used by both
 * the Vercel function (api/parse-plan.js) and the local dev server (vite.config.js).
 */
export async function handleParsePlan({ method, body, env }) {
  if (method !== 'POST') return { status: 405, json: { error: 'Use POST.' } };
  const result = await askGemini({ env, instructions: INSTRUCTIONS, schema: RESPONSE_SCHEMA, text: body?.text });
  if (!result.ok) return { status: result.status, json: result.json };
  return { status: 200, json: sanitize(result.data) };
}
