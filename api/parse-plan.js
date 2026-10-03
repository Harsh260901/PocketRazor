// Vercel serverless function, served at /api/parse-plan.
// The browser sends { text } here; this function adds the secret Gemini key
// (from Vercel's Environment Variables) and returns the plan fields.
import { handleParsePlan } from './_parsePlan.js';

export default async function handler(req, res) {
  const { status, json } = await handleParsePlan({
    method: req.method,
    body: req.body,
    env: process.env,
  });
  res.status(status).json(json);
}
