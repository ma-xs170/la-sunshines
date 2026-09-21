import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import OrgAdminActions from '@/components/admin/OrgAdminActions';
import { adminRpc, requireAdminPage } from '@/lib/adminSpace';
import { one } from '@/lib/organizer/event-data';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organisateur · Gestion', robots: { index: false, follow: false } };
const STATUS: Record<string, string> = { pending: 'En attente', approved: 'Approuvé', suspended: 'Suspendu' };
const TABS: [string, string][] = [['apercu', 'Aperçu'], ['organisation', 'Organisation'], ['evenements', 'Évènements'], ['membres', 'Membres et rôles'], ['finance', 'Finance'], ['support', 'Support'], ['journal', 'Journal d’activité']];
interface Detail { organizer: { id: string; reference: string | null; name: string; legal_form: string; siret: string; address: string; contact_email: string; responsible_name: string; account_status: string; stripe_connected: boolean; stripe_ready: boolean; created_at: string };
  members: { user_id: string; role: string; email: string; first_name: string; last_name: string }[]; events: { slug: string; status: string; starts_at: string; capacity: number; sold: number; revenue_cents: number }[]; activity: { created_at: string; action: string; entity: string }[] }
const ROLE: Record<string, string> = { owner: 'Propriétaire', manager: 'Gestionnaire', staff: 'Staff' };

export default async function OrganizerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const s = await requireAdminPage(`/admin/gestion/organisateurs/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const asked = one((await searchParams).onglet);
  const tab = TABS.some(([k]) => k === asked) ? asked : 'apercu';
  const r = await adminRpc<Detail>('admin_organizer_detail', { p_actor: s.userId, p_org: id });
  if (!r.ok) notFound();
  const { organizer: o, members, events, activity } = r.data;
  const revenue = events.reduce((n, e) => n + e.revenue_cents, 0);
  return (
    <>
      <p className="org__back"><a href="/admin/gestion/organisateurs">← Tous les organisateurs</a></p>
      <h1 className="org-head__title">{o.name}</h1>
      <p className="script"><code>{o.reference ?? 'Référence créée à l’approbation'}</code> · {STATUS[o.account_status]}</p>
      <div className="org-subnav" role="navigation" aria-label="Sections">{TABS.map(([k, v]) => <a key={k} href={`?onglet=${k}`} className={'org-subnav__link' + (tab === k ? ' is-active' : '')} aria-current={tab === k ? 'page' : undefined}>{v}</a>)}</div>
      {tab === 'apercu' && (<>
        <section className="org-kpis"><div className="glass org-kpi"><span className="kicker">Évènements</span><strong>{events.length}</strong><span>au total</span></div>
          <div className="glass org-kpi"><span className="kicker">Billets vendus</span><strong>{events.reduce((n, e) => n + e.sold, 0)}</strong><span>tous évènements</span></div>
          <div className="glass org-kpi"><span className="kicker">Recette nette</span><strong>{formatEuro(revenue)}</strong><span>hors invitations</span></div>
          <div className="glass org-kpi"><span className="kicker">Paiements Stripe</span><strong>{o.stripe_ready ? 'Actifs' : o.stripe_connected ? 'À finaliser' : 'Non reliés'}</strong><span>compte de versement</span></div></section>
        <OrgAdminActions org={{ id: o.id, status: o.account_status as 'pending' | 'approved' | 'suspended', name: o.name, legal_form: o.legal_form, siret: o.siret, responsible_name: o.responsible_name, address: o.address, contact_email: o.contact_email }} events={events.map((e) => e.slug)} />
      </>)}
      {tab === 'organisation' && <section className="glass ef-card"><h2>Informations de la structure</h2><dl className="ef-list" style={{ display: 'block' }}>
        {([['Structure', o.name], ['Forme juridique', o.legal_form], ['SIRET', o.siret || '[À COMPLÉTER]'], ['Responsable', o.responsible_name], ['Adresse', o.address], ['E-mail', o.contact_email], ['Créée le', formatGp(o.created_at)]] as [string, string][]).map(([k, v]) => <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--panel-border)' }}><dt className="ef-help">{k}</dt><dd style={{ margin: 0 }}>{v || 'Non renseigné'}</dd></div>)}</dl>
        <p className="ef-help">Modifier ces informations : onglet Aperçu.</p></section>}
      {tab === 'evenements' && (events.length === 0 ? <div className="glass org-empty"><h3>Aucun évènement</h3><p>Cette organisation n’a pas encore créé d’évènement.</p></div> : <div className="org-table glass"><table><thead><tr><th>Évènement</th><th>Date</th><th>Statut</th><th>Vendus</th><th>Recette</th></tr></thead>
        <tbody>{events.map((e) => <tr key={e.slug}><td data-label="Évènement">{e.slug}</td><td data-label="Date">{formatGp(e.starts_at)}</td><td data-label="Statut">{e.status === 'published' ? (Date.parse(e.starts_at) > Date.now() ? 'À venir' : 'Passé') : e.status === 'draft' ? 'Brouillon' : e.status}</td><td data-label="Vendus">{e.sold} / {e.capacity}</td><td data-label="Recette">{formatEuro(e.revenue_cents)}</td></tr>)}</tbody></table></div>)}
      {tab === 'membres' && (members.length === 0 ? <div className="glass org-empty"><h3>Aucun membre</h3><p>Personne n’est encore rattaché à cette organisation.</p></div> : <div className="org-table glass"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th></tr></thead>
        <tbody>{members.map((m) => <tr key={m.user_id}><td data-label="Nom">{m.first_name} {m.last_name}</td><td data-label="E-mail">{m.email}</td><td data-label="Rôle">{ROLE[m.role] ?? m.role}</td></tr>)}</tbody></table></div>)}
      {tab === 'finance' && <section className="glass ef-card"><h2>Finance (lecture)</h2><p>Recette nette cumulée : <strong>{formatEuro(revenue)}</strong>. Le détail et l’enregistrement des versements se font par évènement dans <a className="ef-link" href="/admin/billetterie">Billetterie</a>.</p></section>}
      {tab === 'support' && <section className="glass ef-card"><h2>Support</h2><p className="ef-help">Les tickets de cette organisation apparaîtront ici avec le module Support.</p></section>}
      {tab === 'journal' && (activity.length === 0 ? <div className="glass org-empty"><h3>Aucune activité</h3><p>Le journal se remplit à chaque action sensible.</p></div> : <div className="org-table glass"><table><thead><tr><th>Date</th><th>Action</th><th>Objet</th></tr></thead>
        <tbody>{activity.map((a, i) => <tr key={i}><td data-label="Date">{formatGp(a.created_at)}</td><td data-label="Action"><code>{a.action}</code></td><td data-label="Objet">{a.entity}</td></tr>)}</tbody></table></div>)}
    </>
  );
}
