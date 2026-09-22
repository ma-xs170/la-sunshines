import type { Metadata } from 'next';
import { BilletterieShell } from '@/lib/ticketing/admin-page';
import { getTicketingSettings } from '@/lib/ticketing/settings';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Aide billetterie · Admin', robots: { index: false, follow: false } };

// Aide de l'équipe : comment tenir la billetterie au quotidien. Réservée au rôle « admin ».
export default async function BilletterieHelpPage() {
  return (
    <BilletterieShell title="Aide billetterie" next="/admin/billetterie/aide">
      <HelpBody />
    </BilletterieShell>
  );
}

async function HelpBody() {
  const settings = await getTicketingSettings(true);
  const native = settings.mode === 'native';
  return (
    <div className="admin-help">
      <section className="admin-panel glass admin-panel--wide">
        <h2>Où en est-on ?</h2>
        <p className="admin-hint">
          Mode actuel : <strong>{native ? 'billetterie interne (ventes ouvertes)' : 'Bizouk (billetterie interne invisible)'}</strong>.
          Le site public ne montre le panneau de réservation, <code>/cgv</code> et <code>/remboursement</code> qu’en mode « interne ».
          Tu bascules dans <Link href="/admin/billetterie">Billetterie</Link> &gt; « Mode de billetterie ». Rien n’est publié tant que tu ne le fais pas.
        </p>
      </section>

      <section className="admin-panel glass admin-panel--wide">
        <h2>Rôles</h2>
        <ul className="admin-hint">
          <li><strong>admin</strong> : réglages, tarifs, commandes, remboursements, invitations, exports, scan.</li>
          <li><strong>staff</strong> : uniquement le scan à l’entrée (<Link href="/admin/scan">/admin/scan</Link>).</li>
          <li><strong>customer</strong> : compte acheteur, voit seulement ses commandes et ses billets.</li>
        </ul>
        <p className="admin-hint">
          Le mot de passe historique de <code>/admin</code> ne donne <strong>aucun</strong> accès à la billetterie : il faut un compte avec le bon rôle.
          Un rôle se donne en SQL dans Supabase (jamais depuis le site) :{' '}
          <code>update public.profiles set role = 'staff' where id = (select id from auth.users where email = 'adresse@exemple.fr');</code>
        </p>
      </section>

      <section className="admin-panel glass admin-panel--wide">
        <h2>1. Préparer un événement</h2>
        <ol className="admin-hint">
          <li>Ouvre l’événement dans <Link href="/admin">/admin</Link> &gt; Événements, bloc « Billetterie ».</li>
          <li>Renseigne la capacité, la fenêtre de vente, puis crée les <strong>tarifs</strong> (prix à 0 € pour un tarif gratuit, sinon au moins 0,50 € : minimum Stripe ; capacité par tarif).</li>
          <li>Coche « Billetterie activée pour cet événement » quand tout est prêt. Un tarif déjà vendu ne se supprime pas : il s’archive.</li>
          <li>Les stocks sont calculés en direct : capacité − billets payés − réservations en cours (15 minutes). Pas de tâche planifiée à surveiller.</li>
        </ol>
        <p className="admin-hint">Attention : le stock interne est indépendant de celui de Bizouk. Si tu vends aussi ailleurs, mets ici seulement les places restantes.</p>
      </section>

      <section className="admin-panel glass admin-panel--wide">
        <h2>2. Suivre les commandes</h2>
        <ul className="admin-hint">
          <li><Link href="/admin/billetterie/commandes">Commandes</Link> : recherche par numéro, email ou nom, détail, statut du paiement et de l’email.</li>
          <li><strong>Renvoyer l’email de billets</strong> si le client ne l’a pas reçu. Le billet reste toujours téléchargeable dans « Mes billets ».</li>
          <li>Statuts d’email : <em>en attente</em>, <em>envoyé</em>, <em>échec</em> (avec la dernière erreur). Un échec d’email n’annule jamais une commande payée.</li>
          <li>Exports : <strong>CSV commandes</strong> et <strong>CSV participants</strong> depuis la liste.</li>
        </ul>
      </section>

      <section className="admin-panel glass admin-panel--wide">
        <h2>3. Rembourser</h2>
        <ul className="admin-hint">
          <li>Dans le détail d’une commande : « Rembourser via Stripe » (total restant ou partiel). Le remboursement est envoyé à Stripe avec une clé d’idempotence : recliquer ne rembourse pas deux fois.</li>
          <li>Annulation d’événement, places épuisées pendant le paiement, erreur de notre part : voir <Link href="/remboursement">la politique publique</Link>.</li>
          <li>Si Stripe échoue, un message s’affiche et la commande reste inchangée : réessaie, puis vérifie dans le tableau de bord Stripe.</li>
          <li><strong>Annuler ce billet</strong> le rend invalide au scan sans rembourser ; le remboursement se fait séparément.</li>
        </ul>
      </section>

      <section className="admin-panel glass admin-panel--wide">
        <h2>4. Invitations</h2>
        <p className="admin-hint">
          <Link href="/admin/billetterie/invitations">Invitations</Link> : crée des billets gratuits (une ligne par invité). Ils portent un QR code comme les autres, sans paiement, et sont envoyés par email.
        </p>
      </section>

      <section className="admin-panel glass admin-panel--wide">
        <h2>5. Le soir de l’événement</h2>
        <ol className="admin-hint">
          <li>Le personnel de l’entrée se connecte avec un compte <strong>staff</strong> et ouvre <Link href="/admin/scan">/admin/scan</Link> sur son téléphone (autoriser la caméra).</li>
          <li>Écran vert = billet valide, entrée validée. Rouge = « déjà scanné » (avec l’heure du premier scan), « billet annulé » (annulé ou remboursé), « autre événement » ou « invalide » (code inconnu).</li>
          <li>Un billet ne passe qu’une fois, même si deux personnes scannent en même temps.</li>
          <li>En cas de doute, la pièce d’identité et le règlement (<Link href="/interdits">/interdits</Link>) s’appliquent toujours.</li>
        </ol>
      </section>

      <section className="admin-panel glass admin-panel--wide">
        <h2>6. Billets PDF et espace organisateur</h2>
        <ul className="admin-hint">
          <li>Chaque billet a un <strong>PDF</strong> (un billet = une page), joint à l’email de confirmation et téléchargeable dans « Mes billets ». Le bloc « Organisateur » du PDF (nom, SIRET, ou responsable) se règle dans <Link href="/admin/billetterie">Billetterie</Link> &gt; Organisateur : sans SIRET ni responsable, le PDF affiche « [À COMPLÉTER] ».</li>
          <li><Link href="/organisateur">/organisateur</Link> : ventes, participants, renvoi du PDF, messages d’information (jamais de promotion), export CSV. Réservé aux comptes admin et aux membres de l’organisateur ; chacun ne voit que ses événements. Donner l’accès : voir <code>docs/billetterie/ORGANISATEUR.md</code> (requête SQL).</li>
          <li>Chaque consultation, export et envoi est enregistré dans le journal d’audit.</li>
        </ul>
      </section>

      <section className="admin-panel glass admin-panel--wide">
        <h2>Dépannage rapide</h2>
        <ul className="admin-hint">
          <li><strong>« Supabase n’est pas configuré »</strong> : variables <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> manquantes sur Vercel.</li>
          <li><strong>Paiement réussi mais pas de billet</strong> : vérifie le webhook Stripe (événements <code>checkout.session.completed</code>, <code>checkout.session.expired</code>, <code>charge.refunded</code>) et <code>STRIPE_WEBHOOK_SECRET</code>.</li>
          <li><strong>Pas d’email</strong> : domaine d’envoi non vérifié chez Resend, ou <code>RESEND_API_KEY</code> absente. Utilise « Renvoyer l’email de billets » une fois corrigé.</li>
          <li><strong>Ne change jamais <code>TICKET_HMAC_SECRET</code></strong> après l’émission de billets : tous les QR deviendraient invalides.</li>
          <li>Vérification d’un déploiement sans rien écrire : <code>npm run smoke -- https://ton-site</code>.</li>
        </ul>
      </section>
    </div>
  );
}
