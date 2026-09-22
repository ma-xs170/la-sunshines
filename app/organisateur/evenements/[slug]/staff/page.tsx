import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { STAFF_ROLE_LABEL, type StaffRow } from '@/lib/organizer/staff';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Liste du staff · Espace organisateur', robots: { index: false, follow: false } };

export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { s, data, title } = await orgEventRpc<StaffRow[]>(slug, `/organisateur/evenements/${slug}/staff`, 'org_staff');
  const members = data.filter((r) => r.role);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Liste du staff</h1><p className="script">{title}</p>
      <section className="glass ef-card">
        <h2>Équipe de l’organisation <span className="org-count">{members.length}</span></h2>
        <p className="org-muted">Toute l’équipe de l’organisation peut intervenir sur ses évènements selon son rôle. Le staff scanne les billets à l’entrée.</p>
        {members.length === 0 ? <p className="org-muted">Aucun membre.</p> : (
          <div className="org-table"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th></tr></thead>
            <tbody>{members.map((m) => <tr key={m.user_id}><td data-label="Nom">{m.name || '—'}</td><td data-label="E-mail">{m.email}</td><td data-label="Rôle">{STAFF_ROLE_LABEL[m.role ?? ''] ?? m.role}</td></tr>)}</tbody></table></div>)}
        <p><Link className="btn btn--outline" href="/organisateur/organisation/membres">Ajouter ou modifier des membres</Link>{!s.isAdmin && <span className="org-muted"> (réservé aux propriétaires)</span>}</p>
      </section>
      <p><Link href={`/organisateur/evenements/${slug}/staff/qr`}>QR code de connexion pour le staff →</Link></p>
    </main>
  );
}
