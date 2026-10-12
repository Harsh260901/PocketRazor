import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { handleParsePlan } from './api/_parsePlan.js';
import { handleParseMember } from './api/_parseMember.js';
import { handleAsk } from './api/_ask.js';
import { handleSendPaymentLinks, handleListPaymentLinks, handleResendLink } from './api/_paymentLinks.js';

// Lets `npm run dev` answer the /api routes on your laptop, the same way
// Vercel does once deployed. Keys are read from .env.local (never
// committed to GitHub) and only used here on the server side.
const ROUTES = {
  '/api/parse-plan': handleParsePlan,
  '/api/parse-member': handleParseMember,
  '/api/ask': handleAsk,
  '/api/send-payment-links': handleSendPaymentLinks,
  '/api/payment-links': handleListPaymentLinks,
  '/api/resend-link': handleResendLink,
};

function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      for (const [path, handle] of Object.entries(ROUTES)) {
        server.middlewares.use(path, async (req, res) => {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          let body = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            /* leave body empty; the handler replies with a clear error */
          }
          const { status, json } = await handle({ method: req.method, body, env });
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(json));
        });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The '' prefix loads every variable in .env.local, including ones that
  // don't start with VITE_. Only VITE_ variables ever reach the browser,
  // so GEMINI_API_KEY stays on the server.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), localApi(env)],
  };
});
