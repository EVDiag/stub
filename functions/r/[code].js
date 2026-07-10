// Cloudflare Pages Function: /r/:code — the referral landing for people who do
// NOT have Stub installed. Installed users never reach this page: App Links
// (Android) / Universal Links (iOS) intercept stub.evdiag.net/r/* and open the
// app with the code pre-filled (see .well-known/). This page closes the other
// half of the funnel: show the code, deep-link the right store, and on Android
// carry the code through the Play Install Referrer so it applies automatically
// on first launch (the app reads `code=XXXX` — see src/lib/referral.ts).

export async function onRequest(context) {
  const raw = String((context.params && context.params.code) || '');
  if (!/^[A-Za-z0-9]{4,12}$/.test(raw)) {
    return Response.redirect('https://stub.evdiag.net/referral.html', 302);
  }
  const code = raw.toUpperCase();

  const ua = context.request.headers.get('user-agent') || '';
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const es = /^es\b/i.test((context.request.headers.get('accept-language') || '').trim());

  const play = 'https://play.google.com/store/apps/details?id=com.stubx.app&referrer=' + encodeURIComponent('code=' + code);
  const appstore = 'https://apps.apple.com/app/id6778758310';

  const t = es
    ? {
        title: 'Tu amigo te regaló un mes de Stub Pro',
        sub: 'Instala Stub — el escáner de recibos y millas para independientes — y canjea este código:',
        copy: 'Copiar',
        copied: 'Copiado ✓',
        getPlay: 'Instalar en Google Play',
        getIos: 'Instalar en el App Store',
        androidNote: 'Al instalar desde esta página, el código se aplica automáticamente al abrir la app.',
        otherNote: 'Después de instalar, ingresa el código en la pantalla de recomendaciones de la app.',
        home: 'Conocer Stub',
      }
    : {
        title: 'Your friend gave you a month of Stub Pro',
        sub: 'Install Stub — the receipt & mileage scanner for the self-employed — and redeem this code:',
        copy: 'Copy',
        copied: 'Copied ✓',
        getPlay: 'Get Stub on Google Play',
        getIos: 'Get Stub on the App Store',
        androidNote: 'Installing from this page applies the code automatically on first launch.',
        otherNote: 'After installing, enter the code on the app’s referral screen.',
        home: 'Learn about Stub',
      };

  // Primary button order: detected platform first; desktop shows both equally.
  const btnPlay = `<a class="btn primary" href="${play}">${t.getPlay}</a>`;
  const btnIos = `<a class="btn primary" href="${appstore}">${t.getIos}</a>`;
  const buttons = isAndroid ? btnPlay : isIOS ? btnIos : btnPlay + btnIos;
  const note = isAndroid ? t.androidNote : t.otherNote;

  const html = `<!doctype html>
<html lang="${es ? 'es' : 'en'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0E0D0B" />
<meta name="robots" content="noindex" />
<title>${t.title} — Stub</title>
<meta property="og:title" content="${t.title}" />
<meta property="og:description" content="${es ? 'Stub: escáner de recibos y millas con IA para independientes. Canjea el código y obtén un mes de Pro gratis.' : 'Stub: the AI receipt & mileage scanner for the self-employed. Redeem the code for a free month of Pro.'}" />
<meta property="og:type" content="website" />
<meta property="og:image" content="https://stub.evdiag.net/og-image.png" />
<meta property="og:url" content="https://stub.evdiag.net/r/${code}" />
<meta name="twitter:card" content="summary_large_image" />
<style>
  :root { --bg:#0E0D0B; --surface:#1A1817; --cream:#F4EDE2; --muted:#8B8278; --gold:#D4A574; --border:#2A2521; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { background:var(--bg); color:var(--cream); font-family:system-ui,-apple-system,'Segoe UI',sans-serif; -webkit-font-smoothing:antialiased; }
  .wrap { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:32px 24px; }
  .mark { font-size:26px; font-weight:700; letter-spacing:-0.5px; margin-bottom:26px; }
  .mark span { color:var(--gold); }
  h1 { font-size:26px; font-weight:700; letter-spacing:-0.5px; max-width:460px; }
  p.sub { color:var(--muted); font-size:15px; margin:12px 0 22px; max-width:420px; line-height:1.55; }
  .codebox { display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--gold); border-radius:16px; padding:14px 18px; margin-bottom:24px; }
  .code { font-size:26px; font-weight:700; letter-spacing:4px; color:var(--gold); font-variant-numeric:tabular-nums; }
  .copybtn { border:1px solid var(--border); background:transparent; color:var(--cream); border-radius:999px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; }
  .btns { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
  .btn { border-radius:999px; padding:13px 26px; font-size:15px; font-weight:700; text-decoration:none; }
  .btn.primary { background:var(--gold); color:var(--bg); }
  .note { margin-top:18px; color:var(--muted); font-size:12.5px; max-width:380px; line-height:1.5; }
  .homelink { margin-top:30px; font-size:13px; }
  a.plain { color:var(--gold); text-decoration:none; }
  a.plain:hover { text-decoration:underline; }
</style>
</head>
<body>
<div class="wrap">
  <div class="mark">stub<span>.</span></div>
  <img src="https://stub.evdiag.net/og-image.png" alt="" style="width:min(430px,92%);border-radius:16px;border:1px solid var(--border);margin-bottom:24px" />
  <h1>${t.title}</h1>
  <p class="sub">${t.sub}</p>
  <div class="codebox">
    <span class="code" id="code">${code}</span>
    <button class="copybtn" id="copy">${t.copy}</button>
  </div>
  <div class="btns">${buttons}</div>
  <p class="note">${note}</p>
  <p class="homelink"><a class="plain" href="/">${t.home}</a></p>
</div>
<script>
  document.getElementById('copy').addEventListener('click', function () {
    var btn = this;
    var done = function () { btn.textContent = ${JSON.stringify(t.copied)}; setTimeout(function () { btn.textContent = ${JSON.stringify(t.copy)}; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(${JSON.stringify(code)}).then(done, done);
    } else {
      var r = document.createRange(); r.selectNodeContents(document.getElementById('code'));
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      try { document.execCommand('copy'); } catch (e) { /* best effort */ }
      s.removeAllRanges(); done();
    }
  });
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-robots-tag': 'noindex',
    },
  });
}
