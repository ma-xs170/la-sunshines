import { NextResponse } from 'next/server';
import { readStore, newId, type Subscription } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { sendMail, mailLayout, siteUrl } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/artists/subscribe  — body { slug, email, consent: true }
export async function POST(req: Request) {
  const rl = await rateLimit(`sub:${clientIp(req)}`, 8, 3600);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Trop de demandes. Réessaie plus tard.' },
      { status: 429 },
    );
  }

  let body: { slug?: unknown; email?: unknown; consent?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const slug = String(body.slug ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();

  if (body.consent !== true) {
    return NextResponse.json(
      { error: 'Le consentement est obligatoire.' },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email) || email.length > 160) {
    return NextResponse.json({ error: 'Email invalide.' }, { status: 400 });
  }

  const store = await readStore();
  const artist = store.artists.find((a) => a.slug === slug);
  if (!artist) {
    return NextResponse.json({ error: 'Artiste introuvable.' }, { status: 404 });
  }

  // idempotent : déjà abonné → succès sans rien changer
  const already = store.subscriptions.find(
    (s) => s.artistSlug === slug && s.email === email,
  );
  if (already) {
    return NextResponse.json({ ok: true, already: true });
  }

  const sub: Subscription = {
    email,
    artistSlug: slug,
    token: `${newId()}${newId()}`,
    createdAt: new Date().toISOString(),
  };
  store.subscriptions.push(sub);

  const saved = await persistStore(store);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 502 });
  }

  const unsub = `${siteUrl()}/api/unsubscribe?token=${encodeURIComponent(sub.token)}`;
  void sendMail({
    to: email,
    subject: `Abonnement confirmé — ${artist.name}`,
    headers: {
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: mailLayout(
      `<p>C’est confirmé&nbsp;: tu recevras un email dès que <strong>${artist.name}</strong>
       sera annoncé au line-up d’une soirée LA SUNSHINES.</p>
       <p style="font-size:12px;color:#8a8378;margin-top:18px">
       Tu peux te <a href="${unsub}">désabonner en 1 clic</a> à tout moment.</p>`,
    ),
  });

  return NextResponse.json({ ok: true });
}
