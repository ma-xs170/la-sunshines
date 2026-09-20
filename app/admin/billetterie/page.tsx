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
        <div className="admin-top__actions"><a className="admin-link" href="/admin">← Retour à l’admin</a></div>
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
          {rows.map((r) => (
            <li key={r.id} className="admin-list__item">
              <div>
                <strong>{names.get(r.event_slug) ?? r.event_slug}</strong>
                {!names.has(r.event_slug) && <span className="admin-error"> — événement éditorial introuvable (slug modifié ?)</span>}
                <p className="admin-hint">
                  {formatGp(r.starts_at)} · {STATUS[r.status] ?? r.status} · billetterie {r.ticketing_enabled ? 'activée' : 'désactivée'} · {r.consumed} / {r.capacity} places
                </p>
                <EventStats slug={r.event_slug} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>,
  );
}
