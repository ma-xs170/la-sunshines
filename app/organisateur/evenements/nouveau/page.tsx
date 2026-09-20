import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Checklist from '@/components/organizer/Checklist';
import { getOrgContext } from '@/lib/organizer/context';
import { can } from '@/lib/organizer/roles';
import { canPublish } from '@/lib/organizer/readiness';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Créer un événement · Espace organisateur', robots: { index: false, follow: false } };

export default async function NewEvent() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/evenements/nouveau');
  if (!s.hasAccess || !current || !can(current.my_role, 'manage')) redirect('/organisateur');
  const ready = canPublish(current);
  return (
    <main className="org org-page">
      <p className="org__back"><a href="/organisateur">← Tous les événements</a></p>
      <h1 className="org-head__title">Créer un événement</h1>
      <p className="script">On monte la prochaine soirée ensemble.</p>
      <Checklist org={current} editable={can(current.my_role, 'owner')} />
      <section className="glass org-panel">
        <h2>Comment ça se passe</h2>
        <p className="org-muted">
          La création d’un événement (programme, flyer, page publique et billetterie) est pour l’instant préparée avec l’équipe LA SUNSHINES.
          {ready ? ' Ton compte est complet : écris-nous les détails de ta soirée et elle sera en brouillon dans ton espace, prête à publier.' : ' Complète d’abord les étapes ci-dessus : elles sont nécessaires pour publier.'}
        </p>
        <p><a className="btn btn--amber" href="/contact">Contacter l’équipe</a></p>
      </section>
    </main>
  );
}
