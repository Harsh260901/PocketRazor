// Vercel serverless function, served at /api/parse-member.
// The browser sends { text, plans }; this function adds the secret Gemini key
// (from Vercel's Environment Variables) and returns New member form fields.
import { handleParseMember } from './_parseMember.js';

export default async function handler(req, res) {
  const { status, json } = await handleParseMember({
    method: req.method,
    body: req.body,
    env: process.env,
  });
  res.status(status).json(json);
}
