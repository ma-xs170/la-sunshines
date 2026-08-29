import { NextResponse } from 'next/server';
import { readStore, newId, type VerificationRequest } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { blobConfigured, isAllowedDoc, uploadVerificationDoc } from '@/lib/blob';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { sendMail, mailLayout, siteUrl } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/artists/claim  — multipart : slug, name, email, file
export async function POST(req: Request) {
  const rl = await rateLimit(`claim:${clientIp(req)}`, 4, 3600);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Trop de demandes. Réessaie plus tard.' },
      { status: 429 },
    );
  }

  if (!blobConfigured()) {
    return NextResponse.json(
      { error: 'Le service de vérification est momentanément indisponible.' },
      { status: 503 },
    );
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const slug = String(fd.get('slug') ?? '').trim();
  const name = String(fd.get('name') ?? '').trim();
  const email = String(fd.get('email') ?? '').trim();
  const file = fd.get('file');

  if (!name || name.length > 120) {
    return NextResponse.json({ error: 'Nom invalide.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Email invalide.' }, { status: 400 });
  }
  if (!(file instanceof File) || !isAllowedDoc(file.type, file.size)) {
    return NextResponse.json(
      { error: 'Document invalide (image ou PDF, 10 Mo max).' },
      { status: 400 },
    );
  }

  const store = await readStore();
  const artist = store.artists.find((a) => a.slug === slug);
  if (!artist) {
    return NextResponse.json({ error: 'Artiste introuvable.' }, { status: 404 });
  }
  if (artist.verified) {
    return NextResponse.json(
      { error: 'Cette page est déjà certifiée.' },
      { status: 409 },
    );
  }
  if (store.verificationRequests.some((v) => v.artistSlug === slug)) {
    return NextResponse.json(
      { error: 'Une demande est déjà en cours d’examen pour cette page.' },
      { status: 409 },
    );
  }

  let up: { url: string; pathname: string; fileType: string };
  try {
    up = await uploadVerificationDoc(file, slug);
  } catch (e) {
    console.error('[claim] upload blob :', e);
    return NextResponse.json(
      { error: 'Impossible d’enregistrer le document. Réessaie.' },
      { status: 502 },
    );
  }

  const request: VerificationRequest = {
    id: newId(),
    artistSlug: slug,
    name,
    email,
    blobUrl: up.url,
    blobPathname: up.pathname,
    fileType: up.fileType,
    createdAt: new Date().toISOString(),
  };
  store.verificationRequests.unshift(request);

  const saved = await persistStore(store);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 502 });
  }

  // accusé de réception (best-effort)
  void sendMail({
    to: email,
    subject: 'Demande de vérification reçue — LA SUNSHINES',
    html: mailLayout(
      `<p>Bonjour ${name},</p>
       <p>Nous avons bien reçu ta demande de vérification pour la page
       <strong>${artist.name}</strong> (<a href="${siteUrl()}/artistes/${slug}">${siteUrl()}/artistes/${slug}</a>).</p>
       <p>Notre équipe l’examine et te répondra par email. Ta pièce d’identité
       sera supprimée dès que la décision aura été prise.</p>`,
    ),
  });

  return NextResponse.json({ ok: true });
}
