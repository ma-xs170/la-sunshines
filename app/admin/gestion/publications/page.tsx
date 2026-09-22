import type { Metadata } from 'next';
import PublicationsQueue, { type PubRow } from '@/components/admin/PublicationsQueue';
import { adminRpc, requireAdminPage } from '@/lib/adminSpace';
import { one } from '@/lib/organizer/event-data';
import '@/components/organizer/wizard.css';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Publications à valider · Admin', robots: { index: false, follow: false } };
const TABS: [string, string][] = [['pending', 'À valider'], ['approved', 'Publiées'], ['rejected', 'Refusées'], ['all', 'Toutes']];

export default async function PublicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireAdminPage('/admin/gestion/publications');
  const asked = one((await searchParams).statut); const st = TABS.some(([k]) => k === asked) ? asked : 'pending';
  const r = await adminRpc<{ counts: { pending: number }; rows: PubRow[] }>('admin_publications', { p_actor: s.userId, p_status: st });
  return (
    <>
      <h1 className="org-head__title">Publications à valider</h1>
      <div className="org-subnav" role="navigation" aria-label="Statuts">{TABS.map(([k, v]) => <Link key={k} href={`?statut=${k}`} className={'org-subnav__link' + (st === k ? ' is-active' : '')} aria-current={st === k ? 'page' : undefined}>{v}{k === 'pending' && r.ok && r.data.counts.pending > 0 && <b className="oside__badge" style={{ marginLeft: 6 }}>{r.data.counts.pending}</b>}</Link>)}</div>
      {!r.ok ? <p className="admin-error" role="alert">{r.message}</p> : r.data.rows.length === 0 ? <div className="glass org-empty"><h3>Aucune demande</h3><p>{st === 'pending' ? 'Rien à valider pour l’instant.' : 'Aucune demande dans cette vue.'}</p></div> : <PublicationsQueue rows={r.data.rows} />}
    </>
  );
}
