# Suivi d'avancement (à relire au début de chaque phase)

Branche : `feat/organisateur-ui`. Migrations déjà appliquées sur la base réelle : 001 → 014.
Méthode : sauvegarde JSON `~/sunshines-backups/` → migration → verify → build/tsc/tests → commit → push → (phase verte) merge main.
Scripts hors dépôt (scratchpad) : `db.mjs` (connexion, lit `.env.local`), `backup.mjs`, `apply.mjs`, `verify.mjs`.

- [x] Phase 0 : audit et décisions
- [x] Phase 1 : références ORG/ADM, menu latéral, temps réel (migration 014 appliquée)
- [x] Phase 2 : pages évènement (sauf Lineup organisateur et job de transcodage 4K : voir DECISIONS D12-D14)
  - [x] 2a libs pures + tests
  - [x] 2b migration 015 APPLIQUÉE sur la base réelle + tests SQL + verify
  - [x] 2c pages organisateur : Description, Lieux, Sessions, Formulaires, CG, RGPD, Décliner le flyer
  - [x] 2d affichage public dresscode couleurs + vidéo flyer (inerte tant que rien n'est saisi)
- [x] Phase 3 (migration 016 APPLIQUÉE) : commandes + détail, remboursements (lecture), historique des scans, invitations (envoi + suivi), codes promo (application au paiement NON branchée). Non faits : simulateur de prix / formulaire de tarif 2 colonnes, glisser-déposer, liste d'entrée, impression de lots PDF, messages en masse (existant conservé), voir DECISIONS D16
- [x] Phase 4 (migration 017 APPLIQUÉE) : cartes de ventes du tableau de bord, finance (récap, versements manuels, CSV), statistiques Ventes (matrice + chaleur), préférences de notification. Non faits : onglets Audience/Acquisition/Tunnel (pas de mesure de fréquentation), envoi e-mail des notifications, formulaire compte de versement (Stripe Connect à la place, D1), D17
- [ ] Phase 4bis-A (demande utilisateur, À FAIRE JUSTE APRÈS LA PHASE 4, sans s'arrêter) : lier les évènements passés à THE MOUV
  1. Compte admin `mathxs.170@gmail.com` : vérifier dans Supabase Auth. Existe → `profiles.role='admin'`, référence ADM. attribuée, membre OWNER de THE MOUV (ORG.78973257). Ne modifier AUCUN autre compte. N'existe pas → ne rien créer, demander à l'utilisateur de s'inscrire sur /inscription avec cet e-mail, puis promouvoir sur confirmation.
  2. Rattacher TOUS les évènements (éditions statiques + data/content.json, La Nuit des Ombres, tous les passés, évènement de test marqué « test ») à THE MOUV. Migration additive et idempotente (table de liaison slug → organisation, ou organization_id si la table existe déjà). Aucune suppression, aucune modification du contenu éditorial, ne pas toucher data/content.json.
  3. Affichage : « Mes évènements » (À venir / Passés / Brouillons), calendrier, page publique THE MOUV (à venir / passés, artistes et DJs déjà programmés), bloc organisateur en bas de chaque page évènement (« THE MOUV — Suivre | Voir les évènements »).
  4. Passés vendus ailleurs (Bizouk) : AUCUN chiffre inventé, afficher « Vendu via Bizouk — statistiques non disponibles ici » + infos éditoriales seulement.
  5. État des lieux avant/après, sauvegarde JSON hors dépôt, fichiers `_down.sql` et `_verify.sql`, puis confirmer le nombre d'évènements rattachés.
- [ ] Phase 4bis-B (demande utilisateur, après 4bis-A) : /admin au même niveau que /organisateur
  - Même DA/layout que /organisateur (menu latéral PLAT pleine hauteur, jamais d'ovale), mêmes cartes, tableaux, états vides, responsive.
  - Menu : Tableau de bord · Organisateurs · Évènements · Administrateurs (super-admin seulement) · Support (Tous, Problème technique, Gestion du compte, Argent & paiement, Demandes de nouveautés, Autre, Mes tickets, Fermés) · Calendrier · Billetterie (mode Bizouk/interne, frais) · Contenu du site (tout l'ancien panneau : éditions, artistes, programme, actualités, règlement, infos) · Journal d'audit · Réglages.
  - Tableau de bord : organisateurs (en attente d'approbation, actifs), évènements à venir, tickets support non pris en charge, ventes plateforme, dernières actions.
  - Toutes les fonctions actuelles de /admin restent accessibles et fonctionnelles ; redirections des anciennes URLs.
- [x] Phase 5 (migration 018 APPLIQUÉE) : administrateurs multiples (création + mot de passe par e-mail, changement obligatoire, verrouillage 5 échecs, désactivation), organisateurs (liste, fiche à onglets, approbation/suspension/contact), transfert atomique, vue globale des évènements, recherche globale Cmd+K (/admin/gestion). Non fait : A2F imposée (colonne prête), création auto de la page publique à l'approbation (Phase 7)
- [ ] Phase 6 : support organisateurs ↔ admins
- [ ] Phase 7 : calendrier régional et pages publiques d'organisateurs
- [ ] Vérification finale (section 11) + ORGA-RAPPORT.md
