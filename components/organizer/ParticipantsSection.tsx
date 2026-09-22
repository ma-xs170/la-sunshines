import ParticipantsPanel from './ParticipantsPanel';
import type { MessageRow } from './MessageComposer';
import { orgRpc, type OrgParticipant } from '@/lib/organizer/data';
import Link from 'next/link';

const PAGE = 25;
const SORTS: Record<string, string> = { date: 'Date d’achat', name: 'Nom', tier: 'Tarif', status: 'Statut', ref: 'Référence' };
const STATUSES: Record<string, string> = { valid: 'Valide', used: 'Entré', cancelled: 'Annulé', refunded: 'Remboursé' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Participants d'un événement : recherche, filtres (tarif, statut), tri, pagination, renvoi du billet, message aux participants, export CSV.
 * Partagé par l'onglet « Participants » d'un événement et par la page « Participants » de la barre du haut.
 * La consultation de la liste est journalisée par la fonction SQL (audit_log).
 * `keep` : paramètres d'URL à conserver dans les liens et le formulaire (ex. l'événement choisi).
 */
export default async function ParticipantsSection({ slug, sp, userId, manage, tiers, replyTo, keep = {}, title = 'Participants' }: {
  slug: string; sp: Record<string, string | string[] | undefined>; userId: string; manage: boolean;
  tiers: { tier_id: string; name: string; archived: boolean; sold: number }[]; replyTo: string; keep?: Record<string, string>; title?: string;
}) {
  const q = one(sp.q).slice(0, 80);
  const tier = UUID.test(one(sp.tier)) ? one(sp.tier) : '';
  const status = STATUSES[one(sp.status)] ? one(sp.status) : '';
  const sort = SORTS[one(sp.sort)] ? one(sp.sort) : 'date';
  const dir = one(sp.dir) === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);

  const [pr, ml] = await Promise.all([
    orgRpc<{ total: number; rows: OrgParticipant[] }>('org_participants', { p_actor: userId, p_slug: slug, p_q: q || null, p_tier: tier || null, p_status: status || null, p_sort: sort, p_dir: dir, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    orgRpc<MessageRow[]>('org_messages_list', { p_actor: userId, p_slug: slug }),
  ]);
  const parts = pr.ok ? pr.data : { total: 0, rows: [] };
  const pages = Math.max(1, Math.ceil(parts.total / PAGE));
  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams(keep);
    const base: Record<string, string | number> = { q, tier, status, sort, dir, page, ...over };
    for (const [k, v] of Object.entries(base)) if (v !== '' && v !== 0 && !(k === 'page' && v === 1) && !(k === 'sort' && v === 'date') && !(k === 'dir' && v === 'desc')) p.set(k, String(v));
    const t = p.toString();
    return t ? `?${t}` : '?';
  };
  const exportHref = `/api/organisateur/events/${slug}/export${(() => { const p = new URLSearchParams(); if (tier) p.set('tier', tier); if (status) p.set('status', status); const t = p.toString(); return t ? `?${t}` : ''; })()}`;
  const tierOptions = tiers.filter((t) => !t.archived || t.sold > 0).map((t) => ({ id: t.tier_id, name: t.name }));

  return (
    <section aria-labelledby="org-part-h" className="org-part">
      <div className="org-part__head">
        <h2 id="org-part-h">{title} <span className="org-count">{parts.total}</span></h2>
        {manage && <Link className="btn btn--outline" href={exportHref}>Exporter (CSV)</Link>}
      </div>
      {!pr.ok && <p className="admin-error" role="alert">Impossible de charger les participants pour l’instant.</p>}
      <form className="org-filters glass" method="get">
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="admin-field"><span>Recherche</span><input name="q" defaultValue={q} placeholder="Nom, email, référence…" maxLength={80} /></label>
        <label className="admin-field"><span>Tarif</span>
          <select name="tier" defaultValue={tier}><option value="">Tous</option>{tiers.map((t) => <option key={t.tier_id} value={t.tier_id}>{t.name}</option>)}</select></label>
        <label className="admin-field"><span>Statut</span>
          <select name="status" defaultValue={status}><option value="">Tous</option>{Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="admin-field"><span>Tri</span>
          <select name="sort" defaultValue={sort}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="admin-field"><span>Ordre</span>
          <select name="dir" defaultValue={dir}><option value="desc">Décroissant</option><option value="asc">Croissant</option></select></label>
        <div className="org-filters__actions"><button className="btn btn--amber">Filtrer</button>{(q || tier || status) && <Link className="btn btn--outline" href={qs({ q: '', tier: '', status: '', sort: 'date', dir: 'desc', page: 1 })}>Effacer</Link>}</div>
      </form>

      <ParticipantsPanel slug={slug} rows={parts.rows} canManage={manage} tiers={tierOptions} history={ml.ok ? ml.data : []} replyTo={replyTo} />

      {pages > 1 && (
        <div className="org-pager" role="navigation" aria-label="Pagination">
          {page > 1 ? <Link className="btn btn--outline" href={qs({ page: page - 1 })}>← Précédent</Link> : <span />}
          <span>Page {page} / {pages}</span>
          {page < pages ? <Link className="btn btn--outline" href={qs({ page: page + 1 })}>Suivant →</Link> : <span />}
        </div>
      )}
    </section>
  );
}
