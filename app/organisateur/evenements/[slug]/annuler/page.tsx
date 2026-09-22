import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { orgRpc } from '@/lib/organizer/data';
import CancelWizard from '@/components/organizer/CancelWizard';
import CancelStatus from '@/components/organizer/CancelStatus';
import type { CancelContext, CancellationState } from '@/lib/organizer/cancellation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Annuler l’évènement · Espace organisateur', robots: { index: false, follow: false } };

// Propriétaire uniquement (_org_access 'owner' côté SQL) : action irréversible, jamais ouverte au staff ni aux gestionnaires.
export default async function CancelEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { s, data, title } = await orgEventRpc<CancelContext>(slug, `/organisateur/evenements/${slug}/annuler`, 'org_cancel_context');
  const state = data.cancelled ? await orgRpc<CancellationState>('org_cancellation_state', { p_actor: s.userId, p_slug: slug }) : null;

  return (
    <main className="org org-page">
      <p className="org__back"><a href={`/organisateur/evenements/${slug}`}>← {title}</a></p>
      <h1 className="org-head__title">Annuler l’évènement</h1>
      {data.cancelled
        ? (state?.ok ? <CancelStatus slug={slug} state={state.data} /> : <p className="admin-error" role="alert">Impossible de charger le suivi de l’annulation.</p>)
        : data.cancellable ? <CancelWizard slug={slug} ctx={data} /> : <div className="glass org-empty"><h3>Annulation impossible</h3><p>Cet évènement est un brouillon, déjà fermé ou déjà passé : il ne peut pas être annulé depuis cette page.</p></div>}
    </main>
  );
}
