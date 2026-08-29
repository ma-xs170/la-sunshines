import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { deleteBlob } from '@/lib/blob';
import { sendMail, mailLayout, siteUrl } from '@/lib/mail';
import { issueArtistLoginToken, sendArtistMagicLink } from '@/lib/artistLogin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/verification/:id  — body { decision: 'approve' | 'refuse' }
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  const { id } = await params;

  let body: { decision?: unknown };
  try {
    body = (await req.json()) as { decision?: unknown };
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }
  const approve = body.decision === 'approve';
  if (body.decision !== 'approve' && body.decision !== 'refuse') {
    return NextResponse.json({ error: 'Décision invalide.' }, { status: 400 });
  }

  const store = await readStore();
  const reqItem = store.verificationRequests.find((v) => v.id === id);
  if (!reqItem) {
    return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
  }

  // 1) suppression IMMÉDIATE du document (quel que soit le résultat)
  await deleteBlob(reqItem.blobPathname || reqItem.blobUrl);

  // 2) statut de l'artiste + retrait de la demande du Store
  const artist = store.artists.find((a) => a.slug === reqItem.artistSlug);
  if (artist) {
    artist.verified = approve;
    // on récupère l'email déclaré dans la demande s'il n'y en a pas encore sur
    // la fiche — c'est l'adresse qui recevra les liens de connexion.
    if (approve && !artist.email && reqItem.email) artist.email = reqItem.email;
  }
  store.verificationRequests = store.verificationRequests.filter((v) => v.id !== id);

  // 3) à l'approbation : premier lien magique vers l'espace artiste
  let magicToken: string | null = null;
  if (approve && artist) magicToken = issueArtistLoginToken(store, artist.slug);

  const saved = await persistStore(store);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 502 });
  }

  // 4) notification de l'artiste (best-effort)
  if (approve && artist && magicToken) {
    void sendArtistMagicLink(artist, magicToken);
    void sendMail({
      to: reqItem.email,
      subject: 'Ta page LA SUNSHINES est certifiée ✓',
      html: mailLayout(
        `<p>Bonjour ${reqItem.name},</p>
         <p>Ta demande a été <strong>approuvée</strong> : la page
         <a href="${siteUrl()}/artistes/${reqItem.artistSlug}">${artist.name}</a>
         affiche désormais le badge « Certifié ».</p>
         <p>Un second email contient ton <strong>lien de connexion</strong> à
         l'espace artiste, où tu peux modifier ta photo, ta bio, tes réseaux et
         ta bannière.</p>
         <p>Ta pièce d’identité a été supprimée de nos serveurs.</p>`,
      ),
    });
  } else {
    void sendMail({
      to: reqItem.email,
      subject: 'Ta demande de vérification — LA SUNSHINES',
      html: mailLayout(
        `<p>Bonjour ${reqItem.name},</p>
         <p>Nous n’avons pas pu valider ta demande de vérification pour la page
         <strong>${artist?.name ?? reqItem.artistSlug}</strong>. Si tu penses
         qu’il s’agit d’une erreur, réponds à cet email.</p>
         <p>Ta pièce d’identité a été supprimée de nos serveurs.</p>`,
      ),
    });
  }

  return NextResponse.json({ ok: true, verified: approve, deployed: saved.deployed });
}
