/**
 * Optional OpenRouter proxy for DigitalEase's Help Assistant.
 *
 * WHY THIS EXISTS
 * A static site (GitHub Pages) cannot keep any value secret from its own
 * visitors — everything shipped to the browser can be read, "encrypted" or
 * not. If you want one shared API key that visitors never see, put it here
 * instead: this worker runs on Cloudflare's servers, holds the real key in
 * an environment variable, and the front-end talks to this worker instead
 * of OpenRouter directly.
 *
 * DEPLOY (free tier, ~5 minutes)
 * 1. Install Wrangler:      npm install -g wrangler
 * 2. Log in:                wrangler login
 * 3. From the worker/ folder (wrangler.toml is already set up here):
 *       cd worker
 * 4. Set your real key as a secret (never committed to git):
 *       wrangler secret put OPENROUTER_API_KEY
 *    (paste your key when prompted — Cloudflare stores it encrypted)
 * 5. (Optional) restrict which sites can call it — edit ALLOWED_ORIGIN below
 *    to your GitHub Pages URL, e.g. 'https://your-username.github.io'.
 * 6. Deploy:                 wrangler deploy
 * 7. Copy the printed *.workers.dev URL into ASSISTANT_PROXY_URL near the
 *    top of ../js/chatbot.js, then commit and push that one-line change.
 *    (The URL itself is fine to make public — it's useless without the
 *    secret key, which never leaves Cloudflare.)
 *
 * This worker deliberately does NOT accept a model or key from the client —
 * it always uses your own OPENROUTER_API_KEY and a fixed allow-listed model,
 * so a visitor cannot use your key to call arbitrary paid models.
 */

const ALLOWED_ORIGIN = '*'; // tighten this to your GitHub Pages URL in production,
                             // e.g. 'https://your-username.github.io'
const ALLOWED_MODELS = new Set([
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'google/gemma-4-31b:free'
  // Add other free model IDs you're happy to allow-list.
]);
const MAX_MESSAGES = 14; // simple abuse guard: cap conversation length per request

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : null;
    if (!messages || messages.length === 0) {
      return json({ error: 'messages array is required' }, 400);
    }

    const requestedModel = typeof body.model === 'string' ? body.model : null;
    const model = requestedModel && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : [...ALLOWED_MODELS][0];

    if (!env.OPENROUTER_API_KEY) {
      return json({ error: 'Server is missing OPENROUTER_API_KEY. See worker/openrouter-worker.js for setup.' }, 500);
    }

    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://digitalease-proxy.workers.dev',
        'X-Title': 'DigitalEase'
      },
      body: JSON.stringify({ model, messages })
    });

    const data = await upstream.text(); // pass through as-is, including error bodies
    return new Response(data, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
