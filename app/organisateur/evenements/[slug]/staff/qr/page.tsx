import type { Metadata } from 'next';
import CopyLink from '@/components/organizer/CopyLink';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { SITE_URL } from '@/lib/organizer/event-links';
import { qrDataUrl } from '@/lib/ticketing/qr';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR codes de connexion · Espace organisateur', robots: { index: false, follow: false } };

export default async function StaffQrPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { title } = await orgEventRpc(slug, `/organisateur/evenements/${slug}/staff/qr`, 'org_staff');
  const link = `${SITE_URL}/connexion?next=${encodeURIComponent(`/organisateur/evenements/${slug}?onglet=scan`)}`;
  const qr = await qrDataUrl(link, 480);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">QR code de connexion</h1><p className="script">{title}</p>
      <section className="glass ef-card">
        <h2>Scan à l’entrée</h2>
        <p>Le staff scanne ce QR code avec son téléphone : il arrive sur la connexion, puis directement sur le scanner de l’évènement. <strong>Chaque personne se connecte avec son propre compte</strong> (rôle « Staff » à donner dans <Link href="/organisateur/organisation/membres">Membres et rôles</Link>) : ce QR ne donne aucun accès à lui seul.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR code menant à la connexion puis au scan de ${title}`} width={240} height={240} style={{ background: '#fff', padding: 8, borderRadius: 12 }} />
        <p><code style={{ wordBreak: 'break-all' }}>{link}</code></p>
        <p className="evlink__row"><CopyLink value={link} /><button type="button" className="btn btn--outline" onClick={undefined} hidden aria-hidden="true" /></p>
      </section>
    </main>
  );
}
