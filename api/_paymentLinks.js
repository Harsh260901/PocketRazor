// Creates Razorpay Payment Links and asks Razorpay to send them by SMS.
// Runs on the server only (Vercel, or inside `npm run dev`), so the
// Razorpay key secret never reaches the browser.
//
// Docs: https://razorpay.com/docs/api/payments/payment-links/create-standard

const MAX_LINKS_PER_REQUEST = 50;
const LINK_VALID_DAYS = 2; // a link can be paid for 2 days after it's sent

const isIndianMobile = (d) => /^[6-9]\d{9}$/.test(d);
const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '').slice(-10);
const mask = (d) => `+91 ${d.slice(0, 2)}XXXXX${d.slice(7)}`;

async function createLink({ keyId, keySecret, link, smsTo }) {
  const phone = smsTo || link.phone;
  const body = {
    amount: Math.round(link.amount * 100), // Razorpay wants paise
    currency: 'INR',
    description: link.description.slice(0, 2048),
    // Unique per link (max 40 characters)
    reference_id: `${link.memberId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 40),
    customer: {
      name: link.name.slice(0, 60),
      contact: `+91${phone}`,
    },
    // SMS only: no emails, so sample members' made-up addresses are never used
    notify: { sms: true, email: false },
    reminder_enable: true,
    expire_by: Math.floor(Date.now() / 1000) + LINK_VALID_DAYS * 24 * 60 * 60,
    notes: {
      member_id: String(link.memberId).slice(0, 60),
      purpose: link.purpose,
      // Which plan this pays for, so a changed plan applies once it's paid
      ...(link.plan ? { plan_id: link.plan.id, plan_name: link.plan.name, interval: link.plan.interval, unit: link.plan.unit } : {}),
    },
  };

  let res;
  try {
    res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Couldn't reach Razorpay. Check your connection and try again." };
  }

  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, id: data.id, shortUrl: data.short_url, status: data.status };

  // Log details on the server only
  console.error('Razorpay error', res.status, JSON.stringify(data));
  if (res.status === 401) {
    return { ok: false, fatal: true, error: 'Razorpay rejected your keys. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' };
  }
  if (res.status === 429) return { ok: false, error: 'Razorpay is busy right now. Try again in a minute.' };
  // Razorpay's own message is safe and useful here, e.g. "contact: length must be 8-14"
  const reason = data?.error?.description;
  return { ok: false, error: reason ? `Razorpay: ${reason}` : 'Razorpay could not create the link. Try again.' };
}

/**
 * Body: { links: [{ memberId, name, phone, email, amount, description, purpose, planId, planName, interval, unit }] }
 * Reply: { results: [{ memberId, ok, id, shortUrl, error }], smsTo }
 */
export async function handleSendPaymentLinks({ method, body, env }) {
  if (method !== 'POST') return { status: 405, json: { error: 'Use POST.' } };

  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return {
      status: 500,
      json: { error: "Razorpay isn't set up yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (see README: Payment links)." },
    };
  }

  // Optional: send every SMS to this one number instead of the member's.
  // Leave RAZORPAY_SMS_TO out of .env.local to text the number on each
  // member's card.
  const overrideRaw = String(env.RAZORPAY_SMS_TO ?? '').trim();
  const overrideDigits = digitsOnly(overrideRaw);
  if (overrideRaw && !isIndianMobile(overrideDigits)) {
    // Set but not filled in properly: refuse rather than text real members by mistake
    return {
      status: 500,
      json: { error: 'RAZORPAY_SMS_TO isn\'t a valid 10-digit mobile number. Fix it, or remove the line to text members directly.' },
    };
  }
  const smsTo = overrideRaw ? overrideDigits : null;

  const raw = Array.isArray(body?.links) ? body.links : [];
  if (raw.length === 0) return { status: 400, json: { error: 'No members to send links to.' } };
  if (raw.length > MAX_LINKS_PER_REQUEST) {
    return { status: 400, json: { error: `Send at most ${MAX_LINKS_PER_REQUEST} links at a time.` } };
  }

  const results = [];
  // One at a time: gentle on Razorpay's rate limits, and a bad key stops early
  for (const item of raw) {
    const link = {
      memberId: String(item?.memberId ?? ''),
      name: String(item?.name ?? '').trim() || 'Member',
      phone: digitsOnly(item?.phone),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item?.email ?? '') ? item.email : '',
      amount: Number(item?.amount),
      description: String(item?.description ?? 'Membership payment'),
      purpose: item?.purpose === 'renewal' ? 'renewal' : 'first_payment',
      plan:
        item?.planName && ['week', 'month', 'year'].includes(item?.unit) && Number(item?.interval) >= 1
          ? {
              id: String(item.planId ?? '').slice(0, 60),
              name: String(item.planName).slice(0, 100),
              interval: String(Math.round(Number(item.interval))),
              unit: item.unit,
            }
          : null,
    };
    if (!link.memberId) {
      results.push({ memberId: link.memberId, ok: false, error: 'Missing member.' });
      continue;
    }
    if (!(link.amount >= 1 && link.amount <= 500000)) {
      results.push({ memberId: link.memberId, ok: false, error: 'Amount must be between ₹1 and ₹5,00,000.' });
      continue;
    }
    if (!smsTo && !isIndianMobile(link.phone)) {
      results.push({ memberId: link.memberId, ok: false, error: "This member's phone number isn't a valid Indian mobile." });
      continue;
    }

    const result = await createLink({ keyId, keySecret, link, smsTo });
    results.push({ memberId: link.memberId, ...result });
    if (result.fatal) {
      // Bad keys: no point trying the rest
      for (const rest of raw.slice(results.length)) {
        results.push({ memberId: String(rest?.memberId ?? ''), ok: false, error: result.error });
      }
      break;
    }
  }

  const allFailed = results.every((r) => !r.ok);
  return {
    status: allFailed && results[0]?.fatal ? 500 : 200,
    json: { results, smsTo: smsTo ? mask(smsTo) : null },
  };
}


/* ---------- Tracking: list recent links, resend SMS ---------- */

const authHeader = (env) =>
  `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;

const keysMissing = (env) =>
  !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET
    ? {
        status: 500,
        json: { error: "Razorpay isn't set up yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (see README: Payment links)." },
      }
    : null;

const TRACK_DAYS = 7; // the Payment links screen shows the last 7 days

/**
 * GET /api/payment-links
 * Links this app sent in the last 7 days (they carry notes.member_id),
 * newest first, with their live status from Razorpay.
 */
export async function handleListPaymentLinks({ method, env }) {
  if (method !== 'GET') return { status: 405, json: { error: 'Use GET.' } };
  const missing = keysMissing(env);
  if (missing) return missing;

  let res;
  try {
    res = await fetch('https://api.razorpay.com/v1/payment_links/', {
      headers: { Authorization: authHeader(env) },
    });
  } catch {
    return { status: 502, json: { error: "Couldn't reach Razorpay. Check your connection and try again." } };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Razorpay list error', res.status, JSON.stringify(data));
    if (res.status === 401) return { status: 500, json: { error: 'Razorpay rejected your keys. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' } };
    return { status: 502, json: { error: "Couldn't load payment links from Razorpay. Try again." } };
  }

  const since = Math.floor(Date.now() / 1000) - TRACK_DAYS * 24 * 60 * 60;
  const links = (Array.isArray(data.payment_links) ? data.payment_links : [])
    .filter((l) => l?.notes?.member_id && Number(l.created_at) >= since)
    .map((l) => {
      const paid = (Array.isArray(l.payments) ? l.payments : []).find((p) => p?.status === 'captured');
      return {
        id: l.id,
        memberId: String(l.notes.member_id),
        memberName: l.customer?.name ?? '',
        description: l.description ?? '',
        amount: Number(l.amount) / 100,
        url: l.short_url,
        status: l.status, // created | partially_paid | paid | expired | cancelled
        sentAt: Number(l.created_at) * 1000,
        expiresAt: l.expire_by ? Number(l.expire_by) * 1000 : null,
        paidAt: paid ? Number(paid.created_at) * 1000 : null,
        method: paid?.method ?? null,
        plan: l.notes.plan_name
          ? { planId: l.notes.plan_id ?? '', planName: l.notes.plan_name, interval: l.notes.interval, unit: l.notes.unit }
          : null,
      };
    })
    .sort((a, b) => b.sentAt - a.sentAt);

  return { status: 200, json: { links } };
}

/**
 * POST /api/resend-link  { id }
 * Re-texts an existing link (no new link, so it doesn't use up Test Mode's 30).
 */
export async function handleResendLink({ method, body, env }) {
  if (method !== 'POST') return { status: 405, json: { error: 'Use POST.' } };
  const missing = keysMissing(env);
  if (missing) return missing;
  const id = String(body?.id ?? '');
  if (!/^plink_[A-Za-z0-9]{14}$/.test(id)) return { status: 400, json: { error: "That payment link ID doesn't look right." } };

  let res;
  try {
    res = await fetch(`https://api.razorpay.com/v1/payment_links/${id}/notify_by/sms`, {
      method: 'POST',
      headers: { Authorization: authHeader(env) },
    });
  } catch {
    return { status: 502, json: { error: "Couldn't reach Razorpay. Check your connection and try again." } };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Razorpay resend error', res.status, JSON.stringify(data));
    if (res.status === 401) return { status: 500, json: { error: 'Razorpay rejected your keys. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' } };
    if (res.status === 429) return { status: 429, json: { error: 'This link was texted very recently. Wait a while before resending.' } };
    const why = data?.error?.description;
    return { status: 400, json: { error: why ? `Razorpay: ${why}` : "Couldn't resend the SMS. Try again." } };
  }
  return { status: 200, json: { ok: true } };
}
