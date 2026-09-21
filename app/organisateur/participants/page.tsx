import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import EventPicker from '@/components/organizer/EventPicker';
import ParticipantsSection from '@/components/organizer/ParticipantsSection';
import { getOrgContext } from '@/lib/organizer/context';
import { editorial, orgRpc, type OrgEventRow, type OrgStats } from '@/lib/organizer/data';
import { can } from '@/lib/organizer/roles';
import { eventState } from '@/lib/organizer/status';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Participants · Espace organisateur', robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// Participants de l'organisation, événement par événement (gestionnaire, propriétaire, admin). La consultation est journalisée.
export default async function ParticipantsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/participants');
  if (!s.hasAccess || !current || !can(current.my_role, 'manage')) redirect('/organisateur');

  const r = await orgRpc<OrgEventRow[]>('org_events', { p_actor: s.userId });
  // À venir d'abord (le plus proche en premier), puis les passés (le plus récent en premier).
  const now = Date.now();
  const rows = (r.ok ? r.data : []).filter((e) => e.organizer_id === current.id && !e.archived);
  const upcoming = rows.filter((e) => eventState(e, now) !== 'ended').sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const past = rows.filter((e) => eventState(e, now) === 'ended').sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const list = [...upcoming, ...past];
  const wanted = one(sp.evenement);
  const chosen = list.find((e) => e.slug === wanted && SLUG_RE.test(wanted)) ?? list[0];

  const st = chosen ? await orgRpc<OrgStats>('org_event_stats', { p_actor: s.userId, p_slug: chosen.slug }) : null;
  return (
    <main className="org org-page">
      <div className="org-head">
        <div>
          <h1 className="org-head__title">Participants</h1>
          <p className="script">{current.name}</p>
        </div>
        {list.length > 0 && chosen && (
          <EventPicker value={chosen.slug} options={list.map((e) => ({ slug: e.slug, label: `${editorial(e.slug).title} · ${formatGp(e.starts_at)}` }))} />
        )}
      </div>
      {!r.ok && <p className="admin-error" role="alert">Impossible de charger les événements pour l’instant.</p>}
      {list.length === 0 && r.ok && (
        <div className="glass org-empty"><p className="script">Rien pour l’instant</p><h2>Aucun participant</h2><p>Les participants apparaîtront ici dès que des billets seront vendus.</p></div>
      )}
      {chosen && st?.ok && (
        <ParticipantsSection slug={chosen.slug} sp={sp} userId={s.userId} manage tiers={st.data.tiers} replyTo={st.data.organizer.contact_email} keep={{ evenement: chosen.slug }} title={editorial(chosen.slug).title} />
      )}
      {chosen && st && !st.ok && <p className="admin-error" role="alert">Impossible de charger cet événement.</p>}
    </main>
  );
}
