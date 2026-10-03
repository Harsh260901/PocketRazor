// Shared helper: send text to Gemini and get structured JSON back.
// Used by both voice features (plans and members). Runs on the server only,
// so the API key never reaches the browser.
//
// Handles Gemini's busy moments: tries the main model, waits a second and
// tries again, then falls back to the lighter Flash-Lite model.

const MAX_INPUT_CHARS = 1000;

/**
 * Returns either { ok: true, data } or { ok: false, status, json: { error } }.
 */
export async function askGemini({ env, instructions, schema, text }) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail(500, "AI isn't set up yet. Add GEMINI_API_KEY (see README: Voice plans).");
  }

  const input = typeof text === 'string' ? text.trim() : '';
  if (!input) return fail(400, 'Say or type something first.');
  if (input.length > MAX_INPUT_CHARS) return fail(400, 'That description is too long. Keep it short.');

  const mainModel = env.GEMINI_MODEL || 'gemini-flash-latest';
  const backupModel = env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
  const attempts = [
    { model: mainModel, waitMs: 0 },
    { model: mainModel, waitMs: 1000 },
    { model: backupModel, waitMs: 500 },
  ];

  let response = null;
  let lastStatus = 0;
  let wasBusy = false; // did Gemini say "busy" at any point?
  for (const { model, waitMs } of attempts) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    try {
      response = await callGemini({ model, apiKey, instructions, schema, text: input });
    } catch {
      response = null; // network problem: try the next attempt
      continue;
    }
    if (response.ok) break;
    lastStatus = response.status;
    // Log the details on the server only; never send them to the browser
    console.error(`Gemini error (${model})`, response.status, await response.text().catch(() => ''));
    const temporary = response.status === 503 || response.status === 500 || response.status === 504;
    if (temporary) wasBusy = true;
    const backupMissing = response.status === 404 && model === backupModel;
    if (!temporary && !backupMissing) break; // e.g. bad key: retrying won't help
  }

  if (!response) return fail(502, "Couldn't reach the AI service. Check your connection and try again.");

  if (!response.ok) {
    if (lastStatus === 429) return fail(429, "You've hit the AI's free limit for now. Try again in a minute.");
    if (lastStatus === 400 || lastStatus === 403) return fail(500, 'The AI key was rejected. Check GEMINI_API_KEY.');
    if (lastStatus === 404 && !wasBusy) return fail(500, "That AI model wasn't found. Check GEMINI_MODEL.");
    if (wasBusy) return fail(503, 'The AI is very busy right now. Wait a few seconds and try again.');
    return fail(502, 'The AI service had a problem. Try again.');
  }

  try {
    const data = await response.json();
    const answer = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return { ok: true, data: JSON.parse(answer) };
  } catch {
    return fail(502, "The AI's answer didn't make sense. Try saying it again.");
  }
}

const fail = (status, error) => ({ ok: false, status, json: { error } });

function callGemini({ model, apiKey, instructions, schema, text }) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });
}
