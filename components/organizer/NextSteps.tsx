import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { orgRpc } from '@/lib/organizer/data';
import { nextSteps, type TicketingMode } from '@/lib/organizer/create-event';
import type { EventPageData } from '@/lib/organizer/event-page-data';
import PublicationPanel, { type PubState } from './PublicationPanel';

/** Checklist « Prochaines étapes » d'un évènement en brouillon (données lues après le contrôle d'accès de la page). */
export default async function NextSteps({ slug, userId, hasTiers, published, fresh, hasFlyer }: { slug: string; userId: string; hasTiers: boolean; published: boolean; fresh: boolean; hasFlyer: boolean }) {
  const [det, row, pub] = await Promise.all([
    orgRpc<EventPageData>('org_event_details', { p_actor: userId, p_slug: slug }),
    createSupabaseAdminClient().from('ticketed_events').select('ticketing_mode, bizouk_event_id').eq('event_slug', slug).maybeSingle(),
    orgRpc<PubState>('org_publication_state', { p_actor: userId, p_slug: slug }),
  ]);
  const d = det.ok ? det.data.details : null;
  const dress = d?.dresscode as { colors?: unknown[]; free?: boolean; note?: string } | undefined;
  const steps = nextSteps({
    hasDescription: Boolean(d?.description?.trim()), hasDresscode: Boolean(dress && ((dress.colors?.length ?? 0) > 0 || dress.free || dress.note)), hasFlyer: hasFlyer || Boolean(det.ok && det.data.media.length) || Boolean(pub.ok && pub.data.checklist.visual),
    hasTiers, mode: ((row.data?.ticketing_mode as TicketingMode) ?? 'internal'), hasBizouk: Boolean(row.data?.bizouk_event_id), published,
  }, `/organisateur/evenements/${slug}`);
  const left = steps.filter((s) => !s.done).length;
  return (
    <section className="glass org-panel" aria-labelledby="next-h">
      {fresh && <p className="ef-warn" role="status">Évènement créé en brouillon : il n’est pas visible du public.</p>}
      <h2 id="next-h">Prochaines étapes</h2>
      <p className="org-muted">{left === 0 ? 'Tout est prêt.' : `${left} étape${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}.`}</p>
      <ol className="ef-list" style={{ listStyle: 'none', padding: 0 }}>
        {steps.map((s) => <li key={s.key}><span>{s.done ? '✔' : '○'} <a href={s.href}>{s.label}</a></span><span className="org-muted">{s.done ? 'Fait' : 'À faire'}</span></li>)}
      </ol>
      {pub.ok && <PublicationPanel slug={slug} state={pub.data} />}
    </section>
  );
}
