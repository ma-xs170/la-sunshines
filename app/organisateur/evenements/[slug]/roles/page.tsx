import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { ROLE_MATRIX, STAFF_ROLE_LABEL, type StaffRow } from '@/lib/organizer/staff';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Rôles de l’évènement · Espace organisateur', robots: { index: false, follow: false } };

export default async function EventRolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await orgEventRpc<StaffRow[]>(slug, `/organisateur/evenements/${slug}/roles`, 'org_staff');
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Rôles de l’évènement</h1><p className="script">{title}</p>
      <p className="org-muted">Les rôles se définissent au niveau de l’organisation : ils valent pour tous ses évènements.</p>
      <ul className="tgauge-list">
        {ROLE_MATRIX.map((r) => {
          const who = data.filter((m) => m.role === r.role);
          return (
            <li key={r.role} className="glass tgauge">
              <div className="tgauge__top"><strong className="tgauge__name">{STAFF_ROLE_LABEL[r.role]}</strong><span className="org-count">{who.length}</span></div>
              <ul>{r.can.map((c) => <li key={c}>{c}</li>)}</ul>
              <p className="org-muted">{who.length ? who.map((m) => m.name || m.email).join(', ') : 'Personne pour l’instant.'}</p>
            </li>
          );
        })}
      </ul>
      <p><a className="btn btn--outline" href="/organisateur/organisation/membres">Gérer les membres et leurs rôles</a></p>
    </main>
  );
}
