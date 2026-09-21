# Audit : refonte espace organisateur et admin (Phase 0)

Date : 20/09/2026 · Branche : `feat/organisateur-ui`

## 1. Ce qui existe déjà

**Base Supabase (migrations 001 → 013, appliquées jusqu'à 009 sur la base réelle ; 010-013 non appliquées)**
- Auth / profils (`profiles.role` : customer / staff / admin), billetterie (`ticketed_events`, `ticket_tiers`, `orders`, `order_items`, `tickets` avec référence `LS-XXXXXX`, `refunds`, `stripe_events`, `audit_log`, `app_settings`), support minimal (`support_tickets`, formulaire de contact), données privées artistes.
- Organisations : `organizers` (nom, forme juridique, SIRET, adresse, e-mail, `is_default` = THE MOUV, `stripe_account_id`), `organizer_members` (owner / manager / staff), `organizer_messages`, `news_posts`, fonctions `org_*` (SECURITY DEFINER, l'acteur est passé en paramètre, rôle revérifié en SQL), `reserve_tickets` atomique.
- Pas de référence ORG / ADM, pas de statut de compte, pas de page publique d'organisateur, pas de sessions, lieux structurés, formulaires, codes promo, support conversationnel, calendrier.

**Espace organisateur `/organisateur` (Next.js App Router)**
- Barre horizontale `OrgTopbar` (Événements, Participants, Analyse, Paiements, Actualités, Aide), sélecteur d'organisation (cookie `sun_org` toujours revalidé).
- Pages : accueil « Bienvenue » (checklist, cartes d'évènements avec progression), page évènement à onglets (Participants / Tarifs / Scan), création d'évènement, participants, analyse, paiements (Stripe Connect), actualités, paramètres, aide.
- Routes `/api/organisateur/*` : garde `requireOrganizerApi`, capacités `scan / manage / owner` (`lib/organizer/roles.ts`).

**Espace admin `/admin`**
- Panneau éditorial (`AdminDashboard` : évènements, artistes, programme, galeries, annonces, vérifications, tickets, actualités) protégé par `ADMIN_PASSWORD` (cookie `sun_admin`). Store `data/content.json`, commit GitHub en production. **À ne pas régresser.**
- `/admin/billetterie` : réglages, évènements, tarifs, commandes, invitations, organisateurs, rôle Supabase `admin`.

**Site public** : ISR `revalidate = 60` sur `/`, `/editions/[slug]` et 4 pages légales ; cache Supabase public 60 s avec tag `ticketing` ; `revalidateTicketing()` déjà appelé après les écritures billetterie ; `StatusWidget` et `Countdown` en `setInterval` 60 s.

**Tests** : `npm run test:db` (base jetable embedded-postgres, SQL + concurrence), `test:unit`, `test:e2e` (banc PostgREST local).

## 2. Travail non commité trouvé dans l'arbre de travail
Fichiers de la session précédente (analyse, paiements Stripe Connect, migration 013, `lib/testEdition.ts`, `s12.mjs`…). `tsc` passe. **Je n'y touche pas et je ne les commite pas** : `data/content.json` contient l'évènement de test « TEST Billetterie » de Mathis (jamais à committer). Mes commits n'ajoutent que mes propres fichiers, et mon CSS va dans un fichier nouveau pour ne pas mélanger les diffs.

## 3. Réutilisé / refait / nouveau

| Sujet | Décision |
|---|---|
| Rôles owner / manager / staff, `_org_access`, `org_*` | **Réutilisés** tels quels (le cahier « viewer » n'existe plus, c'est `staff`) |
| Barre du haut `OrgTopbar` | **Refaite** en menu latéral à deux contextes (compte / évènement) ; ancienne barre conservée pour les pages « accès refusé » |
| Pages Participants, Tarifs, Scan, Analyse, Paiements, Actualités | **Réutilisées**, déplacées dans le menu évènement, sans casser les URL actuelles |
| Compte de versement (IBAN, 4 étapes) | **Remplacé par Stripe Connect** déjà en place : l'IBAN est saisi chez Stripe, jamais stocké chez nous (voir DECISIONS) |
| `audit_log` | **Réutilisé** (`_audit`, `_org_audit`) |
| Support (`support_tickets` = tickets de contact du site) | **Conservé** ; le support organisateurs ↔ admins est un **nouveau** module (`support_threads`), sans toucher à l'existant |
| Système d'évènements éditorial (programme, artistes, MAJUSCULES, création auto) | **Conservé et branché** : les futurs formulaires (lineup) réutilisent `lib/artists.ts`, `lib/artistLinks.ts` |
| Références ORG / ADM, statut de compte, page publique, sessions, lieux, formulaires, codes promo, support, calendrier, suivi | **Nouveaux** |

## 4. Ordre des phases (adapté)
1. **Fondations** : références ORG/ADM (SQL), cycle de vie du compte, menu latéral à deux contextes, temps réel (cache 60 s → invalidation immédiate + Realtime/polling).
2. **Pages évènement** : Description, dresscode couleurs, flyer vidéo, sessions et lieux, lineup, formulaires, CG, RGPD.
3. **Billetterie et ventes** : tarifs avancés, promos, remboursements, commandes, distribution, contrôle d'accès, communication.
4. **Tableau de bord, stats, finance, notifications.**
5. **Admin** : administrateurs multiples, organisateurs, transfert d'évènement.
6. **Support** organisateurs ↔ admins.
7. **Calendrier régional et pages publiques d'organisateurs.**

Chaque phase = migration additive + `_down` + tests SQL + `_verify`, `tsc` + `lint` + `build`, un commit.

## 5. Contraintes vérifiées
- Base partagée prod/preview : les migrations 010-013 ne sont pas appliquées ; elles devront l'être **dans l'ordre**, avant 014+. Aucune `POSTGRES_URL_NON_POOLING` dans `.env.local` : je ne peux pas appliquer moi-même (voir « À faire par Mathis » dans ORGA-RAPPORT).
- Aucune donnée personnelle dans `data/content.json` (dépôt public).
