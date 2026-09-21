import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import RegionalCalendar from '@/components/organizer/RegionalCalendar';
import { getAllEditions } from '@/lib/content';
import { isRegion, REGION_LABEL, REGIONS, type CalEvent } from '@/lib/calendar';
import { getOrgContext } from '@/lib/organizer/context';
import { orgRpc } from '@/lib/organizer/data';
import { one } from '@/lib/organizer/event-data';
import { can } from '@/lib/organizer/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Calendrier · Espace organisateur', robots: { index: false, follow: false } };

// Région OBLIGATOIRE avant l'affichage (mémorisée dans le cookie sun_region). Un organisateur ne voit que les évènements publics de la région et les siens.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/calendrier');
  if (!s.hasAccess || !current || !can(current.my_role, 'manage')) redirect('/organisateur');
  const asked = one((await searchParams).region); const saved = (await cookies()).get('sun_region')?.value;
  const region = isRegion(asked) ? asked : isRegion(saved) ? saved : null;
  if (!region) {
    return (<main className="org org-page"><h1 className="org-head__title">Calendrier</h1><p className="script">Choisis ta région</p>
      <div className="ef"><section className="glass ef-card"><h2>Quelle région t’intéresse ?</h2><div className="ef-row">{REGIONS.map((r) => <a key={r} className="btn btn--outline btn--lg" href={`/api/calendrier/region?region=${r}&next=/organisateur/calendrier`}>{REGION_LABEL[r]}</a>)}</div><p className="ef-help">Ton choix est mémorisé pour la prochaine fois.</p></section></div></main>);
  }
  const from = new Date(Date.now() - 45 * 86400000).toISOString(); const to = new Date(Date.now() + 300 * 86400000).toISOString();
  const r = await orgRpc<CalEvent[]>('calendar_events', { p_actor: s.userId, p_region: region, p_from: from, p_to: to });
  const names = Object.fromEntries(getAllEditions({ includeHidden: true }).map((e) => [e.slug, e.name]));
  return (<main className="org org-page"><h1 className="org-head__title">Calendrier</h1><p className="script">{REGION_LABEL[region]}</p>
    {!r.ok && <p className="admin-error" role="alert">Impossible de charger le calendrier.</p>}<RegionalCalendar region={region} events={r.ok ? r.data : []} admin={false} names={names} /></main>);
}
