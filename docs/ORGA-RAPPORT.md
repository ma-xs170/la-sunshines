# Rapport : refonte espace organisateur et admin

État au 20/09/2026. Tout est mergé sur `main` (dernier merge `acc1c12`). Migrations **014 à 020 appliquées** sur la base réelle (sauvegardes JSON dans `~/sunshines-backups/`, hors dépôt). `002_verify.sql` : 408 contrôles, 0 échec ; chaque `0NN_verify.sql` : 0 échec. Comptages des tables existantes inchangés à chaque migration. **Aucune donnée de test n'a été créée sur la vraie base** (tous les tests SQL tournent en `ROLLBACK` sur une base jetable). Le mode public reste sur **Bizouk** ; les pages ajoutées au public (dresscode couleurs, vidéo, bloc et pages organisateurs) sont inertes tant que ce mode n'est pas changé.

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

Tests : `npm run test:unit` (64) et `npm run test:db` (SQL + concurrence sur base jetable, migrations 001 → 021) passent ; `tsc` et `next build` passent. Le parcours e2e complet (création → achat 4242 → scan → support → transfert) n'a **pas** été rejoué : il exige le banc PostgREST partagé avec d'autres sessions et un Stripe de test ; chaque maillon est couvert par des tests SQL / unitaires. `next lint` n'est pas configuré dans le dépôt (voir D9).

## URLs à ouvrir (connecté avec ton compte admin)
- `/admin/gestion` (recherche globale : ORG.78973257, « MOUV », un e-mail…), `/admin/gestion/organisateurs`, `/admin/gestion/administrateurs`, `/admin/gestion/evenements`, `/admin/gestion/transfert`, `/admin/gestion/support`, `/admin/gestion/calendrier`
- `/organisateur` (nouveau menu), `/organisateur/evenements`, `/organisateur/evenements/<slug>/description` (et `/lieux`, `/sessions`, `/formulaires`, `/conditions`, `/consentements`, `/flyer`, `/commandes`, `/remboursements`, `/promos`, `/invitations`, `/invitations/suivi`, `/scans`, `/finance`, `/stats`), `/organisateur/calendrier`, `/organisateur/support`, `/organisateur/notifications`, `/organisateur/organisation/page-publique`
- Public (inerte tant que le mode reste « bizouk ») : `/organisateurs/the-mouv`, fiches `/editions/<slug>`

## Choix pris (détail dans `ORGA-DECISIONS.md`, D1 à D21)
Stripe Connect à la place d'un formulaire IBAN (D1) ; sondage 2 s plutôt que Realtime push (D7, D20) ; pas de carte à marqueur, coordonnées + lien Google Maps (D13) ; remboursements et application des codes promo au paiement laissés hors des organisateurs (D16) ; espace de gestion admin sur `/admin/gestion`, accès legacy `ADMIN_PASSWORD` inchangé (D18).

## Limites connues
- **Job de transcodage vidéo absent** : une vidéo > 1080p / 60 i/s reste « Envoyée » (l'affiche image est utilisée) ; les règles HEVC / H.264 sont écrites et testées mais aucun ffmpeg ne tourne (D12).
- Lineup côté organisateur, liste d'entrée, impression de lots PDF, simulateur de prix / glisser-déposer des tarifs, statistiques d'audience / acquisition / tunnel : « Bientôt » (aucune donnée inventée).
- Codes promo non appliqués au paiement Stripe ; e-mails automatiques (notifications, « nouvel évènement », réponse de support) non envoyés, seul l'accusé de réception d'un ticket l'est.
- A2F non imposée (colonne `mfa_required` prête). Aucun test visuel navigateur systématique dans cette session : à contrôler sur la preview (menu latéral, tiroir mobile, calendrier).
- Le calendrier ne montre que les évènements de billetterie reliés à un lieu.
- Une autre session Claude travaille en parallèle (migration 021 « billets gratuits », branche paiement) : elle est fusionnée sur `main` mais **021 n'est pas appliquée** à la base réelle par moi.

## À FAIRE PAR MATHIS
1. **Resend** : vérifier un domaine d'envoi. Tant que l'expéditeur est `onboarding@resend.dev`, les invitations d'admins partent « non envoyées » (bouton « Renvoyer » ensuite).
2. **Vercel** : variables Supabase (`NEXT_PUBLIC_SUPABASE_URL`, clé anon, `SUPABASE_SERVICE_ROLE_KEY`), `BLOB_READ_WRITE_TOKEN` (envoi vidéo, logos, pièces jointes du support), `RESEND_API_KEY`, Stripe TEST. Rien de tout cela n'est requis pour que le site actuel reste identique.
3. **Créer ton compte super-admin secondaire** si besoin depuis `/admin/gestion/administrateurs` ; vérifier que ton compte y apparaît « Super-administrateur ».
4. **Juridique** : valider le texte de l'autorisation parentale (12–17 ans) et les conditions par défaut (`lib/rulesText.ts`) ; SIRET de THE MOUV et de LAWCY MUSIC à vérifier ; médiateur de la consommation dans `/cgv` ; TVA 293 B.
5. **Décisions à prendre** : brancher les codes promo au paiement ; job de transcodage vidéo (GitHub Actions gratuit ?) ; ouvrir le lineup aux organisateurs ; supprimer l'accès legacy `sun_admin` quand tu n'en as plus besoin.
6. **Migration 021** (autre session) : à appliquer toi-même ou à me demander, après relecture.
7. **Sauvegardes** `~/sunshines-backups/` : contiennent des données personnelles ; à supprimer quand tu n'en as plus besoin.
8. Passer le mode public de « bizouk » à « native » **seulement** quand tu es prêt : c'est ce qui ouvrira les pages organisateurs et la billetterie.
