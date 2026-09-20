# Rapport : refonte espace organisateur et admin

Mis à jour à la fin de chaque phase.

## Phase 0 : audit (fait)
`docs/ORGA-AUDIT.md`, `docs/ORGA-DECISIONS.md`. `docs/inspiration/` ajouté au `.gitignore` (captures Bizouk non commitées).

## Phase 1 : fondations (fait, non déployé)
- **Références** : migration `20260920001400_org_references.sql` (+ `supabase/down/014_down.sql`, `supabase/tests/014_org_references.sql`, `supabase/tests/014_verify.sql`). `ORG.XXXXXXXX` (organisations) et `ADM.XXXXXXXX` (admins) : aléatoires, uniques, immuables, rétro-remplies (THE MOUV = approuvé). Cycle `en attente → approuvé → suspendu`, recherche admin par référence / nom / e-mail, audit.
- **Menu latéral** à deux contextes (compte / évènement), accordéons à une section ouverte, entrée active à filet d'accent, tiroir mobile, filtré par rôle ; en-tête avec fil d'Ariane, **référence ORG + bouton Copier**, sélecteur d'organisation ; bandeau si le compte est en attente ou suspendu ; pied de page discret. Nouvelle page `/organisateur/evenements` (liste complète).
- **Temps réel** : invalidation immédiate du site public après écriture, stock à 2 s, tableau de bord d'évènement à 2 s.
- **Contrôles** : `tsc`, `next build`, `test:unit` (48), `test:db` (SQL + concurrence) : tout passe.

### URLs à ouvrir (une fois la branche déployée en preview)
`/organisateur` · `/organisateur/evenements` · `/organisateur/evenements/<slug>` (le menu bascule en contexte évènement).

### Limites connues
- Recherche globale et en-tête d'évènement permanent (miniature, statut, lien public) : pas encore faits (Phase 2).
- Pas de test visuel en navigateur dans cette session (pas de base locale lancée) : à contrôler sur la preview.
- Realtime « push » non fait (voir D7).

## À FAIRE PAR MATHIS
1. Appliquer les migrations **010 → 014** sur la base (variable `POSTGRES_URL_NON_POOLING` absente de `.env.local`) : d'abord `supabase/tests/002_verify.sql`, puis `014_verify.sql` pour contrôle.
2. Vérifier le domaine Resend (e-mails d'invitation admin, phase 5).
3. Variables Vercel : à lister au fur et à mesure des phases.
4. Validation juridique de l'autorisation parentale, SIRET à vérifier (phases suivantes).
