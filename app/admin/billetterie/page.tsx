import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { getAllEditions } from '@/lib/content';
import { getTicketingSettings } from '@/lib/ticketing/settings';
import { formatGp } from '@/lib/ticketing/time';
import AdminSettingsForm from '@/components/ticketing/AdminSettingsForm';
import EventStats from '@/components/ticketing/admin/EventStats';
import OrganizerForm, { type OrganizerInfo } from '@/components/ticketing/OrganizerForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Billetterie · Admin', robots: { index: false, follow: false } };

const STATUS: Record<string, string> = { draft: 'Brouillon', published: 'Publié', closed: 'Clos', cancelled: 'Annulé' };

// Réservé au rôle Supabase « admin » (le mot de passe /admin historique ne suffit pas).
export default async function BilletterieAdminPage() {
  const shell = (children: React.ReactNode) => (
    <main className="admin-shell admin-shell--wide">
      <div className="admin-top">
        <h1>Billetterie</h1>
        <div className="admin-top__actions"><a className="admin-link" href="/admin/gestion">Espace de gestion (organisateurs, administrateurs, recherche)</a> <a className="admin-link" href="/admin">← Retour à l’admin</a></div>
      </div>
      {children}
    </main>
  );

  if (!supabaseConfigured() || !supabaseAdminConfigured()) {
    return shell(<p className="admin-hint">Supabase n’est pas (entièrement) configuré : variables d’environnement manquantes.</p>);
  }
  const session = await getSession();
  if (!session) redirect('/connexion?next=/admin/billetterie');
  if (session.profile.role !== 'admin') {
    return shell(<p className="admin-hint">Accès refusé : ton compte n’a pas le rôle « admin ».</p>);
  }

  const settings = await getTicketingSettings(true);
  const db = createSupabaseAdminClient();
  const { data: events } = await db.from('ticketed_events').select('id, event_slug, status, ticketing_enabled, capacity, starts_at').order('starts_at', { ascending: false });
  const { data: orgs } = await db.from('organizers').select('id, name, legal_form, siret, responsible_name, address, contact_email').order('created_at');
  const names = new Map(getAllEditions({ includeHidden: true }).map((e) => [e.slug, e.name]));
  // tarifs actifs par événement (pour dire clairement pourquoi un événement n'est pas visible du public)
  const { data: tierRows } = await db.from('ticket_tiers').select('ticketed_event_id, is_active, archived_at');
  const activeTiers = new Map<string, number>();
  for (const t of tierRows ?? []) if (t.is_active && !t.archived_at) activeTiers.set(t.ticketed_event_id as string, (activeTiers.get(t.ticketed_event_id as string) ?? 0) + 1);

  const rows = await Promise.all(
    (events ?? []).map(async (e) => {
      const { data: consumed } = await db.rpc('event_consumed', { p_event: e.id });
      return { ...e, consumed: (consumed as number) ?? 0 };
    }),
  );

  return shell(
    <>
      <AdminSettingsForm initial={settings} />
      {((orgs ?? []) as OrganizerInfo[]).map((o) => <OrganizerForm key={o.id} initial={o} />)}
      <div className="admin-form__actions">
        <a className="btn btn--outline" href="/admin/billetterie/commandes">Commandes</a>
        <a className="btn btn--outline" href="/admin/billetterie/invitations">Invitations</a>
        <a className="btn btn--outline" href="/admin/scan">Scan à l’entrée</a>
        <a className="btn btn--outline" href="/admin/billetterie/aide">Aide</a>
      </div>
      <section className="admin-panel glass admin-panel--wide">
        <h2>Événements en billetterie</h2>
        <p className="admin-hint">Pour configurer les dates, tarifs et stocks : ouvre l’événement dans l’admin, bloc « Billetterie ».</p>
        {rows.length === 0 && <p className="admin-hint">Aucun événement configuré pour l’instant.</p>}
        <ul className="admin-list">
          {rows.map((r) => {
            const known = names.has(r.event_slug);
            const tiers = activeTiers.get(r.id) ?? 0;
            // Pourquoi le public ne voit pas (encore) cet événement — dans l'ordre où l'admin peut agir.
            const why: string[] = [];
            if (!known) why.push('Aucun événement éditorial avec ce nom (slug) sur ce site : il n’a pas de page publique. (Un événement de test créé sur ton ordinateur n’existe pas en production.)');
            if (r.status === 'draft') why.push('Statut « Brouillon » : passe-le en « Publié ».');
            else if (r.status === 'closed') why.push('Statut « Clos » : les ventes sont arrêtées.');
            else if (r.status === 'cancelled') why.push('Statut « Annulé ».');
            if (!r.ticketing_enabled) why.push('Billetterie désactivée : active l’interrupteur « Billetterie activée ».');
            if (tiers === 0) why.push('Aucun tarif actif : ajoute un tarif.');
            const configOk = why.length === 0;
            const visible = configOk && settings.dbMode === 'native';
            return (
              <li key={r.id} className="admin-list__item">
                <div>
                  <div className="tb-evt__head">
                    <strong>{names.get(r.event_slug) ?? r.event_slug}</strong>
                    <span className={'tb-evt__vis ' + (visible ? 'tb-evt__vis--ok' : 'tb-evt__vis--off')}>
                      {visible ? 'Visible du public' : 'Non visible du public'}
                    </span>
                  </div>
                  <p className="admin-hint">
                    {formatGp(r.starts_at)} · {STATUS[r.status] ?? r.status} · billetterie {r.ticketing_enabled ? 'activée' : 'désactivée'} · {tiers} tarif{tiers > 1 ? 's' : ''} actif{tiers > 1 ? 's' : ''} · {r.consumed} / {r.capacity} places
                  </p>
                  {(!visible) && (
                    <ul className="tb-evt__why">
                      {why.map((w) => <li key={w}>{w}</li>)}
                      {configOk && settings.dbMode !== 'native' && <li>Configuration prête, mais le mode public réel est <strong>Bizouk</strong> : les tarifs ne s’affichent pas au public (voulu tant que tu n’ouvres pas les ventes).{settings.forced ? ' Sur cet ordinateur, le mode de test forcé les affiche.' : ''}</li>}
                    </ul>
                  )}
                  <div className="tb-evt__actions">
                    {known
                      ? <a className="btn btn--outline" href={`/admin?edit=${encodeURIComponent(r.event_slug)}`}>Ouvrir l’évènement dans l’admin</a>
                      : <span className="admin-hint">Lien indisponible : l’événement éditorial est introuvable sur ce site.</span>}
                    {known && <a className="btn btn--outline" href={`/editions/${encodeURIComponent(r.event_slug)}`} target="_blank" rel="noopener noreferrer">Voir la page publique</a>}
                  </div>
                  <EventStats slug={r.event_slug} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>,
  );
}
