import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOrgContext } from '@/lib/organizer/context';
import { can } from '@/lib/organizer/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Aide · Espace organisateur', robots: { index: false, follow: false } };

const FAQ: { q: string; a: string; cap?: 'manage' | 'owner' }[] = [
  { q: 'Comment scanner les billets à l’entrée ?', a: 'Ouvre l’événement puis l’onglet « Scan » (ou le bouton « Scanner » de l’accueil). Autorise la caméra et présente le QR code du billet. Un billet ne passe qu’une seule fois : le deuxième scan indique l’heure du premier.' },
  { q: 'Un participant n’a pas reçu son billet', a: 'Dans « Participants », ligne du participant, utilise « Renvoyer le PDF ». Le billet reste aussi téléchargeable dans son espace « Mes billets ».', cap: 'manage' },
  { q: 'Puis-je modifier un tarif déjà vendu ?', a: 'Tu peux changer son prix et ses dates, mais pas descendre la quantité sous le nombre de billets vendus ou en cours de paiement. Un tarif vendu ne se supprime pas : il est archivé, et les billets déjà émis restent valables. Le prix minimum est de 0,50 €.', cap: 'manage' },
  { q: 'Comment écrire aux participants ?', a: 'Dans « Participants », « Écrire aux participants » : message d’information uniquement (horaires, accès, consignes), sans promotion ni lien. Un aperçu et une confirmation précèdent chaque envoi ; 3 messages maximum par événement et par 24 heures.', cap: 'manage' },
  { q: 'Pourquoi ne puis-je pas publier mon événement ?', a: 'Le compte doit être complet : informations légales de la structure, compte de paiement Stripe et adresse d’envoi des emails. La liste à cocher est en haut de l’accueil.', cap: 'manage' },
  { q: 'Qui peut faire quoi ?', a: 'Le propriétaire gère tout, y compris les informations légales et le paiement. Le gestionnaire gère les événements, tarifs, participants et messages. Le staff ne fait que scanner les billets.' },
];

export default async function HelpPage() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/aide');
  if (!s.hasAccess || !current) redirect('/organisateur');
  const items = FAQ.filter((f) => !f.cap || can(current.my_role, f.cap));
  return (
    <main className="org org-page">
      <div className="org-head"><div><h1 className="org-head__title">Aide</h1><p className="script">On te répond ici.</p></div></div>
      <div className="org-faq">
        {items.map((f) => (
          <details key={f.q} className="glass org-faq__item">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
      <section className="glass org-panel">
        <h2>Une autre question ?</h2>
        <p className="org-muted">Écris à l’équipe LA SUNSHINES : nous répondons dès que possible.</p>
        <p><a className="btn btn--amber" href="/contact">Contacter l’équipe</a></p>
      </section>
    </main>
  );
}
