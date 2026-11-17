/**
 * POST /api/contact — Cloudflare Pages Function.
 *
 * Takes the support form of support.html and support-es.html and sends it to
 * the support inbox through Resend. Made from the Clutch Wear site's function
 * (clutch.evdiag.net, functions/api/contact.js), which sends the same way.
 *
 * Environment variables (Cloudflare -> Pages project "stub" -> Settings ->
 * Variables and Secrets, Production):
 *   RESEND_API_KEY     required, encrypted — from resend.com/api-keys
 *   CONTACT_TO         optional — where messages land. Defaults to
 *                                 support@evdiag.net; several may be listed,
 *                                 comma separated.
 *   CONTACT_FROM       optional — must be on a domain verified in Resend.
 *                                 Defaults to "Stub <noreply@evdiag.net>"
 *   TURNSTILE_SECRET   optional — if set, the form must send a Turnstile token.
 *                                 Leave it unset and that check is skipped.
 *
 * Until RESEND_API_KEY is set the function answers 503 with code
 * "not_configured" and the page shows the address to write to instead.
 */

const MAX = { name: 120, email: 200, topic: 60, message: 5000, ua: 300 };
const TOPICS = new Set([
  'A question', 'Something is wrong / a bug', 'An idea or suggestion',
  'Subscription or billing', 'Something else'
]);
const DEFAULT_TO = 'support@evdiag.net';
const DEFAULT_FROM = 'Stub <noreply@evdiag.net>';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

const fail = (status, code, error) => json({ ok: false, code, error }, status);

// Strip control characters, then trim and cap the length.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const clean = (v, max) =>
  typeof v === 'string' ? v.replace(CONTROL_CHARS, '').trim().slice(0, max) : '';
// The message keeps its line breaks; every other control character goes.
const cleanText = (v, max) =>
  typeof v === 'string'
    ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, max)
    : '';

// Deliberately permissive: rejecting unusual but valid addresses annoys real
// people, and a wrong address only costs us an undeliverable reply.
const emailLooksReal = e => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && e.length <= MAX.email;

// A header value containing a newline could inject extra mail headers.
const safeHeader = s => s.replace(/[\r\n]+/g, ' ').trim();

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;          // not configured, not enforced
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form });
    const d = await r.json();
    return d.success === true;
  } catch {
    return false;
  }
}

async function handlePost(request, env) {
  if (!env.RESEND_API_KEY) {
    return fail(503, 'not_configured', 'The contact form is not configured yet. Please email us directly.');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'bad_request', 'Could not read that request.');
  }
  if (!body || typeof body !== 'object') {
    return fail(400, 'bad_request', 'Could not read that request.');
  }

  // Hidden anti-spam field. A person never sees it, so a value here usually
  // means a bot, but browser autofill and password managers fill hidden fields
  // too. A filled field therefore drops nothing: the message is delivered with
  // "[Possible spam]" in the subject and a person decides (as on Clutch Wear's
  // form since 13 Oct 2026).
  const trap = clean(body.hp_check, 200);

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  const rawTopic = clean(body.topic, MAX.topic);
  const topic = TOPICS.has(rawTopic) ? rawTopic : 'Something else';
  const message = cleanText(body.message, MAX.message);
  const lang = body.lang === 'es' ? 'es' : 'en';

  if (!email || !message) {
    return fail(400, 'missing', 'Please fill in your email and message.');
  }
  if (!emailLooksReal(email)) {
    return fail(400, 'bad_email', 'That email address does not look right.');
  }
  if (message.length < 10) {
    return fail(400, 'too_short', 'Please add a little more detail so we can help.');
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await turnstileOk(env, body.turnstileToken, ip))) {
    return fail(400, 'spam_check', 'Spam check failed. Please reload the page and try again.');
  }

  const country = request.headers.get('CF-IPCountry') || 'unknown';
  const ua = clean(request.headers.get('User-Agent') || '', MAX.ua);
  const text = [
    message, '', '---',
    'From:     ' + (name ? name + ' <' + email + '>' : email),
    'Topic:    ' + topic,
    'Language: ' + lang,
    'Country:  ' + country,
    'Browser:  ' + (ua || 'unknown'),
    'Sent:     ' + new Date().toISOString(),
    'Via:      stub.evdiag.net support form',
    ...(trap ? ['Note:     the hidden anti-spam field was filled in (' + JSON.stringify(trap) +
                '), so this may be a bot, or browser autofill.'] : [])
  ].join('\n');

  const to = String(env.CONTACT_TO || DEFAULT_TO).split(',').map(a => a.trim()).filter(Boolean);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM || DEFAULT_FROM,
        to,
        reply_to: email,                       // hitting Reply answers the sender
        subject: (trap ? '[Possible spam] ' : '') +
                 '[Stub] ' + safeHeader(topic) + ' - ' + safeHeader(name || email),
        text
      })
    });

    if (!res.ok) {
      console.error('Resend rejected the message:', res.status, await res.text());
      return fail(502, 'send_failed', 'We could not send that just now. Please email us directly.');
    }
    // Resend's own id, so a message can be traced in the Resend log by id
    // rather than hunted for by timestamp.
    let id = null;
    try { id = (await res.json()).id || null; } catch {}
    console.log('Support message accepted by Resend:', id, trap ? '(flagged: hidden field filled)' : '');
    return json({ ok: true, id });
  } catch (err) {
    console.error('Contact form failed:', err);
    return fail(502, 'send_failed', 'We could not send that just now. Please email us directly.');
  }
}

// One handler for every method, so a POST can reach only handlePost.
export async function onRequest({ request, env }) {
  if (request.method === 'POST') return handlePost(request, env);
  return fail(405, 'method', 'Method not allowed.');
}
