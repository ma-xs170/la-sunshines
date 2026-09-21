import { linkedEditionsOf } from '@/lib/eventLinks';

/** Évènements rattachés à une organisation (table event_links) qui n'ont pas de session géolocalisée : ils ne peuvent pas figurer dans le calendrier régional, on les liste ici (sans région inventée). */
export default async function LinkedEventsList({ orgId }: { orgId?: string }) {
  const list = (await linkedEditionsOf(orgId)).filter((e) => !e.archived).sort((a, b) => (b.dateISO ?? '').localeCompare(a.dateISO ?? ''));
  if (!list.length) return null;
  return (
    <section className="glass ef-card" aria-labelledby="linked-ev" style={{ marginTop: 24 }}>
      <h2 id="linked-ev">Évènements rattachés (éditions du site, vendues via Bizouk ou test)</h2>
      <ul className="ef-list">
        {list.map((e) => (
          <li key={e.slug}>
            <span><a href={`/editions/${e.slug}`}><strong>{e.name}</strong></a>{e.isTest && <em> · test</em>}{e.hidden && <em> · brouillon</em>}<br /><span className="org-muted">{e.dateLabel || 'Date à préciser'}{e.venue ? ` · ${e.venue}` : ''}</span></span>
            <span className="org-muted">{e.past ? 'Passé' : 'À venir'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
