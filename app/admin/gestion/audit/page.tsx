import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/adminSpace';
import { one } from '@/lib/organizer/event-data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Journal d’audit · Admin', robots: { index: false, follow: false } };
const PAGE = 50;
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'America/Guadeloupe' });

// Lecture seule : le journal n'est jamais modifiable depuis l'interface.
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage('/admin/gestion/audit');
  const sp = await searchParams;
  const action = one(sp.action).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 60);
  const page = Math.max(1, Math.min(200, Number(one(sp.page)) || 1));
  const db = createSupabaseAdminClient();
  let q = db.from('audit_log').select('id, action, entity, entity_id, created_at, actor_id, meta', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (action) q = q.ilike('action', `${action}%`);
  const { data, count, error } = await q;
  const ids = [...new Set((data ?? []).map((l) => l.actor_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length) for (const p of (await db.from('profiles').select('id, first_name, last_name').in('id', ids)).data ?? []) names.set(p.id as string, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Admin');
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;
  return (
    <>
      <h1 className="org-head__title">Journal d’audit</h1>
      <form className="org-filters glass" method="get" role="search">
        <label className="sr-only" htmlFor="action">Action</label><input id="action" className="org-search" name="action" defaultValue={action} placeholder="Action (ex. payout, organizer, support)" />
        <button className="btn btn--amber">Filtrer</button>
      </form>
      {error ? <p className="admin-error" role="alert">Impossible de charger le journal.</p> : !(data ?? []).length ? <div className="glass org-empty"><h3>Aucune entrée</h3><p>Aucune action ne correspond.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Objet</th></tr></thead>
          <tbody>{(data ?? []).map((l) => <tr key={l.id as number}><td data-label="Date">{when(l.created_at as string)}</td><td data-label="Auteur">{names.get(l.actor_id as string) ?? 'Système'}</td><td data-label="Action"><code>{l.action as string}</code></td><td data-label="Objet">{l.entity as string}{l.entity_id ? <><br /><span className="org-muted">{String(l.entity_id).slice(0, 40)}</span></> : null}</td></tr>)}</tbody></table></div>)}
      {pages > 1 && <p className="org-muted">Page {page} / {pages} {page > 1 && <a href={href(page - 1)}>← Précédente</a>} {page < pages && <a href={href(page + 1)}>Suivante →</a>}</p>}
    </>
  );
}
