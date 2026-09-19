# Mise en ligne des paiements — préparation (rien de ce qui suit n'est fait tant que tu ne donnes pas le feu vert)

État à la livraison : le code de la billetterie est **présent mais inerte** en production : sans variables Supabase, aucune
page de compte ne fonctionne, aucun achat n'est possible, Bizouk est inchangé. Le **flag** `ticketing_mode` vaut `bizouk` par défaut.

---

## 1. Variables d'environnement

### 1.1 Production (Vercel → Settings → Environment Variables → coche **Production**)

| Variable | Valeur attendue | Où la trouver |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase (projet **de production**) → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé `anon` / « publishable » (publique) | même page |
| `SUPABASE_SERVICE_ROLE_KEY` | clé `service_role` / « secret ». **Secrète : jamais dans le code, jamais `NEXT_PUBLIC_`** | même page |
| `STRIPE_SECRET_KEY` | `sk_live_…` (⚠ tant que c'est `sk_test_`, la production journalise un avertissement et **aucun argent n'est encaissé**) | Stripe (mode **Live**) → Développeurs → Clés API |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | *(facultatif)* `pk_live_…`, **même mode** que la clé secrète (sinon refus de démarrer) | même page |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` de l'endpoint **live** (§4) | Stripe (Live) → Webhooks → ton endpoint → Signing secret |
| `TICKET_HMAC_SECRET` | 32+ caractères aléatoires : `openssl rand -base64 32`. **À ne JAMAIS changer** ensuite (tous les billets deviendraient invalides). Sauvegarde-le dans ton gestionnaire de mots de passe. | à générer |
| `MAIL_FROM` | `La Sunshines <billets@ton-domaine>` — domaine **vérifié dans Resend** | Resend → Domains |
| `RESEND_API_KEY` | déjà présente (contact) ; vérifie qu'elle a le droit d'envoi sur ce domaine | Resend → API Keys |
| `NEXT_PUBLIC_SITE_URL` | `https://<domaine-de-production>` sans `/` final. **Obligatoire** : liens des emails et retours de paiement | ton domaine |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | injectées quand le store Vercel KV est lié au projet. **Obligatoires** : sans KV, inscription, mot de passe oublié et paiement sont **refusés** (anti-abus) | Vercel → Storage |
| `NEXT_PUBLIC_GOOGLE_AUTH` | `1` seulement si Google est activé dans Supabase (facultatif) | — |
| *déjà en place* | `ADMIN_PASSWORD`, `GITHUB_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `MISTRAL_API_KEY`, `GOOGLE_MAPS_API_KEY`… | inchangées |

`VERCEL_ENV` est posée automatiquement par Vercel : ne la définis pas.

### 1.2 Preview (coche **Preview**, idéalement limitée à la branche de test)

Mêmes noms, avec des valeurs de **test** : projet Supabase de **test**, `sk_test_…`, `whsec_…` de l'endpoint de test, `TICKET_HMAC_SECRET`
**différent**, `NEXT_PUBLIC_SITE_URL` = l'URL de Preview **stable** (les URL de Preview changent à chaque déploiement : utilise l'alias de branche).
Une clé `sk_live_` sur Preview **fait refuser le démarrage**.

Après toute modification de variable : **redéploie** (les variables ne s'appliquent qu'aux nouveaux déploiements).

## 2. Supabase Auth (projet de production)

| Réglage | Valeur |
|---|---|
| Authentication → URL Configuration → **Site URL** | `https://<domaine-de-production>` |
| **Redirect URLs** | `https://<domaine-de-production>/**` · `http://localhost:3000/**` · (Preview) `https://la-sunshines-git-billetterie-<équipe>.vercel.app/**` |
| Providers → Email | *Enable Email provider* ✔, **Confirm email** ✔, longueur minimale du mot de passe **8** |
| Email Templates | *Confirm signup* et *Reset password* : gabarits de `supabase/README.md` (lien `token_hash`) |
| Providers → Google | facultatif : Client ID / Secret Google Cloud, puis `NEXT_PUBLIC_GOOGLE_AUTH=1` |

## 3. SMTP personnalisé via Resend (Authentication → Emails → SMTP Settings → *Enable Custom SMTP*)

Sans SMTP personnalisé, Supabase n'envoie qu'aux membres de ton équipe, avec une limite très basse : **indispensable avant l'ouverture**.

| Champ | Valeur |
|---|---|
| Sender email | `no-reply@<ton-domaine-vérifié-dans-Resend>` |
| Sender name | `La Sunshines` |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — alternative `587` |
| Minimum interval between emails | `1` seconde |
| Username | `resend` |
| Password | une **clé API Resend** (Resend → API Keys → *Sending access*, restreinte à ton domaine) — pas la clé principale |

Ensuite : Authentication → **Rate Limits** → « Rate limit for sending emails » à un niveau adapté (par ex. 100 / heure).
Prérequis Resend : domaine **vérifié** (enregistrements DNS SPF, DKIM et DMARC au vert).

## 4. Webhook Stripe **live**

Stripe (**Live**) → Développeurs → Webhooks → *Ajouter un endpoint* :

- **URL** : `https://<domaine-de-production>/api/stripe/webhook`
- **Version d'API** : celle par défaut du compte
- **Événements — exactement ces 3** : `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`
- Copie le *Signing secret* → `STRIPE_WEBHOOK_SECRET` (Production) → redéploie.
- Vérifie ensuite dans l'onglet *Tentatives* : réponses **200**.

Prérequis du compte Stripe : activation (identité de **l'entité qui vend**, voir `LEGAL.md`), coordonnées bancaires, nom sur le relevé, détails publics.

## 5. Ordre de mise en ligne (à ne faire qu'au feu vert)

1. **Base de production** : applique `supabase/migrations/*.sql` dans l'ordre (un fichier à la fois), puis `002_rls_ticketing.sql`, `002_rules.sql`, `002_verify.sql` (0 ligne `ÉCHEC`). **Pas** de test de concurrence sur cette base.
2. Compte admin : `/inscription` → confirme → `update public.profiles set role = 'admin' where id = (select id from auth.users where email = '…');`. Comptes de porte : rôle `staff`.
3. Variables **Production** (§1.1) puis **redéploie**. `npm run smoke -- https://<domaine>` : tout doit être ✔ (flag encore sur Bizouk).
4. Configure l'édition (bloc Billetterie), **sans** basculer le flag : `ticketing_enabled` coché, statut *Publié* → rien n'est visible tant que le mode global est `bizouk`.
5. **Test réel avec ta propre carte** (Stripe Live) : crée dans l'événement un tarif « Test interne » à **0,50 €**, stock **1**, max 1 par commande ;
   bascule le flag **en heures creuses** ; achète ce billet, vérifie email, « Mes billets », scan ; **rembourse-le depuis l'admin** ; **archive** le tarif ;
   repasse sur Bizouk si tu n'as pas fini la configuration. (Le flag est global : pendant ces minutes, les visiteurs voient le panneau de tarifs.)
6. Fais relire et complète les pages légales (`LEGAL.md`) : **`/cgv` contient encore la zone « médiateur — à compléter »**.
7. **Feu vert** → `/admin/billetterie` → **Billetterie interne**. Prends les 10 premières minutes pour surveiller Stripe → Webhooks et l'admin.

## 6. Plan de retour arrière

| Besoin | Action | Délai |
|---|---|---|
| **Couper les ventes tout de suite** | `/admin/billetterie` → **Bizouk** (les pages se rafraîchissent immédiatement ; `/api/checkout` répond 403). Sans accès à l'admin : SQL Editor → `update public.app_settings set value = '"bizouk"' where key = 'ticketing_mode';` (les pages se mettent à jour sous **60 s**) | immédiat |
| Couper un seul événement | bloc Billetterie → décocher *Billetterie activée* | immédiat |
| Commandes en cours | les réservations non payées expirent seules en 15 min ; les commandes **payées restent valides** (billets, scan, remboursements possibles) | — |
| **Annuler le déploiement** | Vercel → Deployments → le déploiement précédent → *Promote / Instant Rollback* (sans git) | ~1 min |
| **Revert du code** | `git revert -m 1 <commit-de-merge>` puis `git push` sur `main` → Vercel redéploie | ~2 min |
| Base de données | **ne pas** dérouler les fichiers `supabase/down/*` en production : ils refusent de s'exécuter s'il existe des commandes payées, et les tables inertes ne gênent rien | — |
| Clé Stripe / secret compromis | roule la clé dans Stripe puis mets à jour la variable + redéploie. **Ne change jamais `TICKET_HMAC_SECRET`** sauf compromission (tous les billets émis seraient à réémettre) | — |
