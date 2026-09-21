import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminShellData } from '@/lib/admin/shell-data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_LABEL, PRIORITY_LABEL } from '@/lib/support';
import { formatEuro } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tableau de bord · Admin · LA SUNSHINES', robots: { index: false, follow: false } };

const ACTION_LABEL: Record<string, string> = { 'payout.record': 'Versement enregistré' };
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'America/Guadeloupe', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'America/Guadeloupe', day: '2-digit', month: 'short', year: 'numeric' });

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const d = await getAdminShellData().catch(() => null);
  // Anciennes URLs : /admin?edit=<slug> ouvrait l'évènement dans le panneau de contenu ; sans compte admin (mot de passe historique) on y va directement.
  const edit = Array.isArray(sp.edit) ? sp.edit[0] : sp.edit;
  if (edit && /^[a-z0-9][a-z0-9-]{0,98}$/.test(edit)) redirect(`/admin/contenu?edit=${encodeURIComponent(edit)}`);
  if (!d) redirect('/admin/contenu');

  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [pend, act, upc, upcList, sup, supList, sales, log] = await Promise.all([
    db.from('organizers').select('id', { count: 'exact', head: true }).eq('account_status', 'pending'),
    db.from('organizers').select('id', { count: 'exact', head: true }).eq('account_status', 'approved'),
    db.from('ticketed_events').select('id', { count: 'exact', head: true }).eq('status', 'published').gt('starts_at', now),
    db.from('ticketed_events').select('event_slug, starts_at, organizers(name, reference)').eq('status', 'published').gt('starts_at', now).order('starts_at').limit(5),
    db.from('support_threads').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('support_threads').select('id, reference, subject, category, priority, organizers(name)').eq('status', 'open').order('created_at', { ascending: false }).limit(5),
    db.from('orders').select('total_cents, fee_cents, refunded_cents, paid_at').eq('source', 'web').in('status', ['paid', 'partially_refunded']).gte('paid_at', since).limit(5000),
    db.from('audit_log').select('id, action, entity, created_at, actor_id').order('created_at', { ascending: false }).limit(8),
  ]);
  const rows = sales.data ?? [];
  const gross = rows.reduce((n, o) => n + (o.total_cents ?? 0) - Math.min(o.refunded_cents ?? 0, o.total_cents ?? 0), 0);
  const fees = rows.reduce((n, o) => n + (o.fee_cents ?? 0), 0);
  const actorIds = [...new Set((log.data ?? []).map((l) => l.actor_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (actorIds.length) for (const p of (await db.from('profiles').select('id, first_name').in('id', actorIds)).data ?? []) names.set(p.id as string, (p.first_name as string) || 'Admin');
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  return (
    <main className="org org-home">
      <div className="org-head">
        <div><h1 className="org-head__title">Tableau de bord</h1><p className="script">{d.firstName ? `Bonjour ${d.firstName}.` : 'Bonjour.'}</p></div>
      </div>

      <section className="org-kpis" aria-label="Indicateurs">
        <a className="glass org-kpi" href="/admin/gestion/organisateurs?statut=pending"><span className="kicker">Organisateurs en attente</span><strong>{pend.count ?? 0}</strong><span>à approuver</span></a>
        <a className="glass org-kpi" href="/admin/gestion/organisateurs?statut=approved"><span className="kicker">Organisateurs actifs</span><strong>{act.count ?? 0}</strong><span>approuvés</span></a>
        <a className="glass org-kpi" href="/admin/gestion/evenements"><span className="kicker">Évènements à venir</span><strong>{upc.count ?? 0}</strong><span>publiés</span></a>
        <a className="glass org-kpi" href="/admin/gestion/support"><span className="kicker">Tickets non pris en charge</span><strong>{sup.count ?? 0}</strong><span>ouverts</span></a>
        <div className="glass org-kpi"><span className="kicker">Ventes de la plateforme</span><strong>{formatEuro(gross)}</strong><span>30 derniers jours · dont {formatEuro(fees)} de frais de service</span></div>
      </section>

      <div className="ef">
        <section className="glass ef-card"><h2>Tickets support à traiter</h2>
          {!(supList.data ?? []).length ? <div className="org-empty"><h3>Aucun ticket ouvert</h3><p>Tout est pris en charge.</p></div> : (
            <div className="org-table"><table><thead><tr><th>Ticket</th><th>Organisateur</th><th>Objet</th><th>Priorité</th></tr></thead>
              <tbody>{(supList.data ?? []).map((t) => <tr key={t.id as string}><td data-label="Ticket"><a href={`/admin/gestion/support/${t.id}`}><code>{t.reference as string}</code></a><br /><span className="org-muted">{CATEGORY_LABEL[t.category as string]}</span></td>
                <td data-label="Organisateur">{one(t.organizers as { name: string } | { name: string }[] | null)?.name ?? '—'}</td><td data-label="Objet">{t.subject as string}</td><td data-label="Priorité">{PRIORITY_LABEL[t.priority as string]}</td></tr>)}</tbody></table></div>)}
          <p className="org-muted"><a href="/admin/gestion/support">Voir tous les tickets</a></p>
        </section>

        <section className="glass ef-card"><h2>Prochains évènements</h2>
          {!(upcList.data ?? []).length ? <div className="org-empty"><h3>Aucun évènement à venir</h3><p>Aucun évènement publié n’est prévu.</p></div> : (
            <div className="org-table"><table><thead><tr><th>Date</th><th>Évènement</th><th>Organisateur</th></tr></thead>
              <tbody>{(upcList.data ?? []).map((e) => { const o = one(e.organizers as { name: string; reference: string | null } | { name: string; reference: string | null }[] | null); return <tr key={e.event_slug as string}><td data-label="Date">{day(e.starts_at as string)}</td><td data-label="Évènement">{e.event_slug as string}</td><td data-label="Organisateur">{o?.name ?? '—'}{o?.reference && <><br /><code>{o.reference}</code></>}</td></tr>; })}</tbody></table></div>)}
        </section>

        <section className="glass ef-card"><h2>Dernières actions</h2>
          {!(log.data ?? []).length ? <div className="org-empty"><h3>Aucune action</h3><p>Le journal est vide pour l’instant.</p></div> : (
            <ul className="ef-list">{(log.data ?? []).map((l) => <li key={l.id as number}><span>{ACTION_LABEL[l.action as string] ?? (l.action as string)} <span className="org-muted">· {l.entity as string}</span></span><span className="org-muted">{names.get(l.actor_id as string) ?? 'Système'} · {when(l.created_at as string)}</span></li>)}</ul>)}
          <p className="org-muted"><a href="/admin/gestion/audit">Ouvrir le journal d’audit</a></p>
        </section>
      </div>
    </main>
  );
}
