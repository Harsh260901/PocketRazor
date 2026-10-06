// Vercel serverless function, served at /api/payment-links.
// Returns the payment links this app sent in the last 7 days, with their
// live status from Razorpay (the secret keys stay on the server).
import { handleListPaymentLinks } from './_paymentLinks.js';

export default async function handler(req, res) {
  const { status, json } = await handleListPaymentLinks({ method: req.method, env: process.env });
  res.status(status).json(json);
}
