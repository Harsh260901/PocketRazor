// Vercel serverless function, served at /api/send-payment-links.
// Adds the secret Razorpay keys (from Vercel's Environment Variables),
// creates Payment Links and has Razorpay send them by SMS.
import { handleSendPaymentLinks } from './_paymentLinks.js';

export default async function handler(req, res) {
  const { status, json } = await handleSendPaymentLinks({
    method: req.method,
    body: req.body,
    env: process.env,
  });
  res.status(status).json(json);
}
