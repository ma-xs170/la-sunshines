import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · LA SUNSHINES</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#FFF8EE;color:#191410;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.box{max-width:420px;padding:32px;text-align:center}
h1{font-size:20px;margin:0 0 10px}p{color:#6b6459;line-height:1.6}
a{display:inline-block;margin-top:18px;background:#FFB238;color:#191410;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:999px}</style>
</head><body><div class="box"><h1>${title}</h1><p>${body}</p><a href="/">Retour au site</a></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

async function unsubscribe(token: string): Promise<Response> {
  if (!token) return page('Lien invalide', 'Ce lien de désabonnement est incomplet.');
  const store = await readStore();
  const before = store.subscriptions.length;
  store.subscriptions = store.subscriptions.filter((s) => s.token !== token);
  if (store.subscriptions.length === before) {
    return page('Déjà désabonné', 'Cet abonnement n’existe plus — rien à faire.');
  }
  const saved = await persistStore(store);
  if (!saved.ok) {
    return page('Oups', 'Impossible de finaliser pour l’instant. Réessaie dans un instant.');
  }
  return page('Désabonnement confirmé', 'Tu ne recevras plus d’emails pour cet artiste.');
}

// GET (lien 1 clic depuis l'email) et POST (List-Unsubscribe-Post / RFC 8058)
export async function GET(req: Request) {
  return unsubscribe(new URL(req.url).searchParams.get('token')?.trim() ?? '');
}
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get('token')?.trim() ?? '';
  if (!token) {
    try {
      const fd = await req.formData();
      token = String(fd.get('token') ?? '').trim();
    } catch {
      /* ignore */
    }
  }
  return unsubscribe(token);
}
