// Vercel serverless function, served at /api/resend-link.
// Asks Razorpay to text an existing payment link again.
import { handleResendLink } from './_paymentLinks.js';

export default async function handler(req, res) {
  const { status, json } = await handleResendLink({ method: req.method, body: req.body, env: process.env });
  res.status(status).json(json);
}
