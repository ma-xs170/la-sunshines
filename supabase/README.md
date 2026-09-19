# Supabase — La Sunshines

## Migrations (`supabase/migrations/`)

| Fichier | Phase | Contenu |
|---|---|---|
| `20260920000100_auth_profiles.sql` | 1 | profils, rôles, réglages (`app_settings`), RLS |

Elles ne sont **appliquées automatiquement nulle part**. Pour les appliquer :
SQL Editor Supabase (coller le fichier), ou `npx supabase link` puis `npx supabase db push`.

## Tests RLS (`supabase/tests/`)

Coller `001_rls_profiles.sql` dans le SQL Editor **après** la migration 001. Le script tourne
dans une transaction annulée (`ROLLBACK`) : aucune donnée n'est conservée. Il s'arrête sur
`FAIL n : …` au premier problème ; sinon il affiche `ALL OK`.

Les tests sur les commandes / billets (un client ne voit pas ceux d'un autre) arrivent avec la
migration qui crée ces tables (phase 2).

## Premier admin (manuel, jamais automatique)

1. Crée ton compte via `/inscription` et confirme l'email.
2. Dans le SQL Editor :

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'TON_EMAIL');
```

Personnel de porte (accès au scan uniquement) : même requête avec `role = 'staff'`.

## Réglages Auth à faire dans le dashboard Supabase

**Authentication > URL Configuration**
- Site URL : l'URL de production
- Redirect URLs : `https://<domaine>/**` et `http://localhost:3000/**`

**Authentication > Providers > Email** : « Confirm email » activé ; longueur minimale du mot de passe : 8.

**Authentication > Email Templates** — remplace le lien des deux gabarits (le flux
`token_hash` marche même si l'email est ouvert sur un autre appareil que celui de l'inscription) :

*Confirm signup* — sujet « Confirme ton compte La Sunshines »
```html
<h2>Bienvenue à La Sunshines !</h2>
<p>Clique pour confirmer ton adresse email et activer ton compte :</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&next=/compte">Confirmer mon compte</a></p>
<p>Si tu n'es pas à l'origine de cette inscription, ignore ce message.</p>
```

*Reset password* — sujet « Réinitialise ton mot de passe La Sunshines »
```html
<h2>Mot de passe oublié ?</h2>
<p>Clique pour en choisir un nouveau (lien valable 1 heure) :</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&next=/mot-de-passe/reinitialiser">Choisir un nouveau mot de passe</a></p>
<p>Si tu n'as rien demandé, ignore ce message.</p>
```

**Google (optionnel)** : Authentication > Providers > Google (Client ID / Secret créés dans Google
Cloud Console, redirect = celui affiché par Supabase), puis `NEXT_PUBLIC_GOOGLE_AUTH=1`.
