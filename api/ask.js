// Vercel serverless function, served at /api/ask.
// The browser sends { text, plans }; this works out what the merchant asked
// (using the secret Gemini key) and returns the intent. The app then answers
// from its own records.
import { handleAsk } from './_ask.js';

export default async function handler(req, res) {
  const { status, json } = await handleAsk({ method: req.method, body: req.body, env: process.env });
  res.status(status).json(json);
}
