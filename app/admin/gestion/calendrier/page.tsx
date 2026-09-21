import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import LinkedEventsList from '@/components/organizer/LinkedEventsList';
import RegionalCalendar from '@/components/organizer/RegionalCalendar';
import { adminRpc, requireAdminPage } from '@/lib/adminSpace';
import { getAllEditions } from '@/lib/content';
import { isRegion, REGION_LABEL, REGIONS, type CalEvent } from '@/lib/calendar';
import { one } from '@/lib/organizer/event-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Calendrier · Gestion', robots: { index: false, follow: false } };

export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireAdminPage('/admin/gestion/calendrier');
  const asked = one((await searchParams).region); const saved = (await cookies()).get('sun_region')?.value;
  const region = isRegion(asked) ? asked : isRegion(saved) ? saved : null;
  if (!region) return (<><h1 className="org-head__title">Calendrier</h1><section className="glass ef-card"><h2>Quelle région ?</h2><div className="ef-row">{REGIONS.map((r) => <a key={r} className="btn btn--outline btn--lg" href={`/api/calendrier/region?region=${r}&next=/admin/gestion/calendrier`}>{REGION_LABEL[r]}</a>)}</div></section></>);
  const r = await adminRpc<CalEvent[]>('calendar_events', { p_actor: s.userId, p_region: region, p_from: new Date(Date.now() - 45 * 86400000).toISOString(), p_to: new Date(Date.now() + 300 * 86400000).toISOString() });
  const names = Object.fromEntries(getAllEditions({ includeHidden: true }).map((e) => [e.slug, e.name]));
  return (<><h1 className="org-head__title">Calendrier · {REGION_LABEL[region]}</h1>{!r.ok && <p className="admin-error" role="alert">{r.message}</p>}<RegionalCalendar region={region} events={r.ok ? r.data : []} admin names={names} /><LinkedEventsList /></>);
}
