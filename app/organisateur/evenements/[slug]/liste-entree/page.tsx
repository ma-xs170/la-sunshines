import type { Metadata } from 'next';
import { orgEventRpc, one } from '@/lib/organizer/event-data';
import { type OrgParticipant } from '@/lib/organizer/data';
import { formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Liste d’entrée · Espace organisateur', robots: { index: false, follow: false } };

const PAGE = 100;

export default async function EntryListPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const vue = one(sp.vue) === 'entres' ? 'entres' : 'attendus';
  const q = one(sp.q).slice(0, 80);
  const [{ data, title }, { data: other }] = await Promise.all([
    orgEventRpc<{ total: number; rows: OrgParticipant[] }>(slug, `/organisateur/evenements/${slug}/liste-entree`, 'org_participants', { p_q: q || null, p_tier: null, p_status: vue === 'entres' ? 'used' : 'valid', p_sort: 'name', p_dir: 'asc', p_limit: PAGE, p_offset: 0 }),
    orgEventRpc<{ total: number; rows: OrgParticipant[] }>(slug, `/organisateur/evenements/${slug}/liste-entree`, 'org_participants', { p_q: null, p_tier: null, p_status: vue === 'entres' ? 'valid' : 'used', p_sort: 'name', p_dir: 'asc', p_limit: 1, p_offset: 0 }),
  ]);
  const attendus = vue === 'attendus' ? data.total : other.total, entres = vue === 'entres' ? data.total : other.total;
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Liste d’entrée</h1><p className="script">{title}</p>
      <div className="org-subnav" role="navigation" aria-label="Vues">
        <a className={'org-subnav__link' + (vue === 'attendus' ? ' is-active' : '')} href="?vue=attendus" aria-current={vue === 'attendus' ? 'page' : undefined}>À entrer ({attendus})</a>
        <a className={'org-subnav__link' + (vue === 'entres' ? ' is-active' : '')} href="?vue=entres" aria-current={vue === 'entres' ? 'page' : undefined}>Déjà entrés ({entres})</a>
      </div>
      <form className="org-filters glass" method="get">
        <input type="hidden" name="vue" value={vue} />
        <label className="admin-field"><span>Recherche</span><input name="q" defaultValue={q} placeholder="Nom, référence…" maxLength={80} /></label>
        <div className="org-filters__actions"><button className="btn btn--amber">Rechercher</button>{q && <a className="btn btn--outline" href={`?vue=${vue}`}>Effacer</a>}</div>
      </form>
      {data.rows.length === 0 ? <div className="glass org-empty"><h3>{q ? 'Aucun résultat' : vue === 'entres' ? 'Personne n’est encore entré' : 'Aucun billet à entrer'}</h3><p>{q ? 'Essaie un autre nom ou une autre référence.' : 'La liste se remplit avec les billets valides et se met à jour à chaque scan.'}</p></div> : (
        <div className="org-table"><table>
          <thead><tr><th>Nom</th><th>Tarif</th><th>Billet</th>{vue === 'entres' && <th>Entré à</th>}</tr></thead>
          <tbody>{data.rows.map((r) => <tr key={r.id}><td data-label="Nom">{r.holder_last_name.toUpperCase()} {r.holder_first_name}</td><td data-label="Tarif">{r.tier_name}</td><td data-label="Billet"><code>{r.reference}</code></td>{vue === 'entres' && <td data-label="Entré à">{r.used_at ? formatGp(r.used_at) : '—'}</td>}</tr>)}</tbody></table></div>)}
      {data.total > PAGE && <p className="org-muted">{PAGE} premières lignes sur {data.total} : affine la recherche pour retrouver quelqu’un.</p>}
      <p><a className="btn btn--outline" href={`/organisateur/evenements/${slug}?onglet=scan`}>Ouvrir le scan</a></p>
    </main>
  );
}
