# Rapport : refonte espace organisateur et admin

État au 21/09/2026. Tout est mergé sur `main` (dernier merge `7304f82` ; tag de secours `pre-orga-2026-09-21` = état de main avant ce lot). Migrations **014 à 020 appliquées** (puis **022 à 025 appliquées** le 21/09 ; **021 « billets gratuits » appliquée le 21/09**) sur la base réelle (sauvegardes JSON dans `~/sunshines-backups/`, hors dépôt). `002_verify.sql` : 408 contrôles, 0 échec ; chaque `0NN_verify.sql` : 0 échec. Comptages des tables existantes inchangés à chaque migration. **Aucune donnée de test n'a été créée sur la vraie base** (tous les tests SQL tournent en `ROLLBACK` sur une base jetable). Le mode public reste sur **Bizouk** ; les pages ajoutées au public (dresscode couleurs, vidéo, bloc et pages organisateurs) sont inertes tant que ce mode n'est pas changé.

## Ce qui est fait
| Phase | Contenu | Migration |
|---|---|---|
| 0 | Audit, décisions (`ORGA-AUDIT.md`, `ORGA-DECISIONS.md`) | — |
| 1 | Références `ORG.XXXXXXXX` / `ADM.XXXXXXXX` (aléatoires, uniques, immuables), cycle en attente → approuvé → suspendu, menu latéral à deux contextes filtré par rôle, en-tête avec référence copiable, temps réel (invalidation immédiate, stock à 2 s) | 014 |
| 2 | Description (éditeur, visibilité, publication différée), **dresscode par couleurs** (autocomplétion, migration douce, affichage public), **flyer vidéo** (envoi direct, règles 1080p/60 i/s), lieux + régions, sessions (avertissement de changement de date), formulaires (autorisation parentale, désactivée), conditions, consentements, déclinaison du flyer (Story / Carré / Bannière) | 015 |
| 3 | Commandes (liste, recherche, pagination, détail), remboursements (lecture), historique des scans, invitations (envoi + suivi sans coordonnées), codes promo (gestion + contrôle) | 016 |
| 4 | Ventes du jour / hier / mois avec variation, finance (récapitulatif, versements manuels, CSV), statistiques de ventes (matrice, chaleur), préférences de notification | 017 |
| 5 | Administrateurs multiples (mot de passe aléatoire par e-mail, changement obligatoire, verrouillage 5 échecs, désactivation), organisateurs (fiche à onglets, approuver / suspendre / contact), transfert d'évènement atomique, vue globale des évènements, **recherche globale Cmd+K** | 018 |
| 6 | Support : tickets `TK.XXXXXX`, chat (2 s), pièces jointes privées, ajout d'une organisation par référence ORG, prise en charge atomique, notes internes, réponses rapides, bouton d'aide flottant | 019 |
| 7 | Pages `/organisateurs/[slug]` (auto à l'approbation, avatar aux initiales, JSON-LD, sitemap), bloc « Organisé par », Suivre (opt-in), calendrier régional organisateur + admin avec conflits | 020 |
| 4bis-A | Évènements existants rattachés à THE MOUV (table `event_links`, 6 éditions), compte `mathxs.170@gmail.com` super-admin + OWNER de THE MOUV, « Vendu via Bizouk — statistiques non disponibles ici » | 022 |
| 4bis-B | `/admin` au même design que `/organisateur` (menu latéral plat, tableau de bord, journal d'audit, réglages), ancien panneau en `/admin/contenu` | — |
| C | Inscription d'organisation en 5 pages (`/devenir-organisateur`), pièces en stockage privé, consultation par les admins (journalisée) | 023 |
| D | Recherche globale admin (Cmd+K), branchée dans le cadre `/admin` | 018 |
| E | Création d'évènement en 3 étapes (organisation → billetterie interne / Bizouk / aucune → informations), brouillon + checklist « Prochaines étapes », menu Billetterie par évènement, **code Bizouk analysé (liste blanche bizouk.com) et widget régénéré en iframe sandbox** | 024 |
| F | Codes promo appliqués au paiement (remise calculée en base, montant Stripe = total en base) ; évènement de test supprimé (sauvegarde + liste exacte) ; SIRET de THE MOUV corrigé (10665995600010, journalisé) | 025 |

Tests (21/09) : `npm run test:unit` 104/104, `npm run test:db` (SQL + concurrence, migrations 001 → 025) tout passe, `tsc` et `next build` (dossier séparé) passent, banc e2e : s3, s4, s6, s7, s8, s13, s14 (création + inscription, Playwright), s15 (Playwright : pages publiques, organisateur, admin, ordinateur + mobile, menu plat) et s16 (promo) passent. **Échecs e2e déjà présents avant ce lot** (mesurés sur `fd4024f`) : s5 (4), s9 (4), s10 (4), s11 (5), s12 (4) : attentes devenues fausses (403 « Accès refusé » au lieu de 200/404, textes) ; aucun échec nouveau. `npm run lint` n'est pas configuré dans le projet.

## URLs à ouvrir sur ton téléphone (connecté avec mathxs.170@gmail.com)
- `/admin` (tableau de bord), `/admin/gestion/organisateurs` (fiche > onglet « Dossier d'inscription »), `/admin/gestion/audit`, `/admin/gestion/reglages`, `/admin/contenu` (ancien panneau)
- `/organisateur/evenements/nouveau` (assistant en 3 étapes), `/organisateur/evenements` (onglets À venir / Passés / Brouillons), `/devenir-organisateur` (inscription), `/organisateur/calendrier`
- Après une création : `/organisateur/evenements/<slug>` (checklist) et `/organisateur/evenements/<slug>/billetterie`
- Public : `/`, `/editions`, `/editions/la-nuit-des-ombres`, `/artistes`, `/interdits`, `/infos`, `/connexion`, `/organisateurs/the-mouv`

## Anciennes URLs (mêmes pages, connecté admin)
- `/admin/gestion` (recherche globale : ORG.78973257, « MOUV », un e-mail…), `/admin/gestion/organisateurs`, `/admin/gestion/administrateurs`, `/admin/gestion/evenements`, `/admin/gestion/transfert`, `/admin/gestion/support`, `/admin/gestion/calendrier`
- `/organisateur` (nouveau menu), `/organisateur/evenements`, `/organisateur/evenements/<slug>/description` (et `/lieux`, `/sessions`, `/formulaires`, `/conditions`, `/consentements`, `/flyer`, `/commandes`, `/remboursements`, `/promos`, `/invitations`, `/invitations/suivi`, `/scans`, `/finance`, `/stats`), `/organisateur/calendrier`, `/organisateur/support`, `/organisateur/notifications`, `/organisateur/organisation/page-publique`
- Public (inerte tant que le mode reste « bizouk ») : `/organisateurs/the-mouv`, fiches `/editions/<slug>`

## Choix pris (détail dans `ORGA-DECISIONS.md`, D1 à D21)
Stripe Connect à la place d'un formulaire IBAN (D1) ; sondage 2 s plutôt que Realtime push (D7, D20) ; pas de carte à marqueur, coordonnées + lien Google Maps (D13) ; remboursements et application des codes promo au paiement laissés hors des organisateurs (D16) ; espace de gestion admin sur `/admin/gestion`, accès legacy `ADMIN_PASSWORD` inchangé (D18).

## Limites connues
- **Job de transcodage vidéo absent** : une vidéo > 1080p / 60 i/s reste « Envoyée » (l'affiche image est utilisée) ; les règles HEVC / H.264 sont écrites et testées mais aucun ffmpeg ne tourne (D12).
- Lineup côté organisateur, liste d'entrée, impression de lots PDF, simulateur de prix / glisser-déposer des tarifs, statistiques d'audience / acquisition / tunnel : « Bientôt » (aucune donnée inventée).
- Évènements créés en ligne : brouillons, sans page publique `/editions/<slug>` ni bouton « Publier » (la publication passe par l'équipe) ; capacité provisoire de 100 places. Le widget Bizouk d'un tel évènement s'affiche dans l'aperçu organisateur ; côté public il faut une édition (limite connue). Mode public en base : repassé sur « bizouk » le 21/09 (journalisé). SIRET de THE MOUV aligné sur 10665995600010 partout (base, `/mentions-legales`, `/cgv`, `LEGAL.md`, billet PDF via la base). Migration 021 appliquée le 21/09. Vercel : voir le suivi (projet exact non identifiable via l'API disponible). Un code promo qui rendrait la commande gratuite est refusé (les billets gratuits ont leur parcours).
- E-mails automatiques (notifications, « nouvel évènement », réponse de support) non envoyés, seul l'accusé de réception d'un ticket l'est.
- A2F non imposée (colonne `mfa_required` prête). Aucun test visuel navigateur systématique dans cette session : à contrôler sur la preview (menu latéral, tiroir mobile, calendrier).
- Le calendrier ne montre que les évènements de billetterie reliés à un lieu.
- Une autre session Claude travaille en parallèle (migration 021 « billets gratuits », branche paiement) : elle est fusionnée sur `main` mais **021 n'est pas appliquée** à la base réelle par moi.

## Publication d'un évènement créé en ligne : étapes restantes (non construites)
Objectif : après approbation de l'organisation, l'organisateur publie lui-même son évènement, sous contrôle d'un admin.
1. **Base** : table `event_publication_requests` (évènement, demandeur, statut `pending` / `approved` / `rejected`, motif, dates) ; fonctions `org_request_publication` (contrôle : organisation approuvée, rôle propriétaire ou gestionnaire, checklist complète : description, lieu, date, tarifs ou widget Bizouk valide, pas de demande déjà en cours) et `admin_review_publication` (approuver / refuser avec motif). Journal d'audit à chaque étape.
2. **Approbation** : passe `ticketed_events.status` de `draft` à `published` (et `ticketing_enabled` seulement en mode « internal » avec Stripe prêt) ; refus = retour en brouillon avec motif visible.
3. **Bouton « Demander la publication »** dans la checklist « Prochaines étapes » (remplace le lien vers le support), avec état « Demande envoyée le … » et annulation.
4. **File d'attente admin** : page `/admin/gestion/publications` (entrée de menu + pastille sur le tableau de bord), filtres En attente / Traitées, aperçu de l'évènement avant décision, boutons Approuver / Refuser.
5. **Page publique** : passerelle entre un évènement créé en ligne et `/editions/<slug>` (aujourd'hui les pages viennent du code et de `data/content.json`) : édition construite depuis `event_details`, `event_venues` / `event_sessions`, flyer et dresscode ; le widget Bizouk et la billetterie interne s'y branchent comme pour les éditions actuelles ; sitemap et bloc « Organisé par ».
6. **Interrupteur de sécurité** inchangé : `ticketing_mode` global (« bizouk » aujourd'hui) ; un évènement « internal » n'est visible que si le mode public est ouvert, un évènement « bizouk » affiche toujours son widget.
7. **Notifications** : e-mail à l'organisateur (approuvée / refusée) et aux admins (nouvelle demande) ; capacité réelle demandée avant publication (100 places provisoires).
8. **Tests** : SQL (rôles, organisation non approuvée, double demande, refus), e2e (demande → approbation → page publique → widget), Playwright de la file admin.

## À FAIRE PAR MATHIS
1. **Resend** : vérifier un domaine d'envoi. Tant que l'expéditeur est `onboarding@resend.dev`, les invitations d'admins partent « non envoyées » (bouton « Renvoyer » ensuite).
2. **Vercel** : variables Supabase (`NEXT_PUBLIC_SUPABASE_URL`, clé anon, `SUPABASE_SERVICE_ROLE_KEY`), `BLOB_READ_WRITE_TOKEN` (envoi vidéo, logos, pièces jointes du support), `RESEND_API_KEY`, Stripe TEST. Rien de tout cela n'est requis pour que le site actuel reste identique.
3. **Créer ton compte super-admin secondaire** si besoin depuis `/admin/gestion/administrateurs` ; vérifier que ton compte y apparaît « Super-administrateur ».
4. **Juridique** : valider le texte de l'autorisation parentale (12–17 ans) et les conditions par défaut (`lib/rulesText.ts`) ; SIRET de THE MOUV et de LAWCY MUSIC à vérifier ; médiateur de la consommation dans `/cgv` ; TVA 293 B.
5. **Décisions à prendre** : brancher les codes promo au paiement ; job de transcodage vidéo (GitHub Actions gratuit ?) ; ouvrir le lineup aux organisateurs ; supprimer l'accès legacy `sun_admin` quand tu n'en as plus besoin.
6. ~~Migration 021~~ : appliquée le 21/09 (sauvegarde `~/sunshines-backups/avant-021`).
7. **Sauvegardes** `~/sunshines-backups/` : contiennent des données personnelles ; à supprimer quand tu n'en as plus besoin.
8. Passer le mode public de « bizouk » à « native » **seulement** quand tu es prêt : c'est ce qui ouvrira les pages organisateurs et la billetterie.
