# Guide de test réel sur la Preview (Supabase de TEST + Stripe mode test)

But : dérouler le parcours complet sur la **Preview de la branche `billetterie`**, avec un **vrai projet
Supabase de test** (jamais celui de production) et **Stripe en mode test**.

> Règle d'or : ne lance JAMAIS les tests de concurrence (`supabase/tests/*_concurrency.mjs`) sur la base de production.
> Ils écrivent et suppriment des données. Sur la base de TEST, tu peux tout lancer.

---

## 0. Ce qu'il te faut

| Élément | Où |
|---|---|
| Un projet Supabase **de test** (région EU) | supabase.com → New project → nomme-le `sunshines-test` |
| Un compte Stripe en **mode test** | dashboard.stripe.com → bascule « Mode test » |
| Un domaine vérifié dans Resend | resend.com → Domains (sans domaine à toi, Resend n'envoie qu'à ton propre email) |
| L'URL de Preview **stable** de la branche | Vercel → projet → Deployments → branche `billetterie` → domaine du type `la-sunshines-git-billetterie-<équipe>.vercel.app` |

## 1. Base de test

1. Supabase (projet de test) → **SQL Editor** → colle et exécute, **dans l'ordre**, un fichier à la fois :
   `supabase/migrations/20260920000100_auth_profiles.sql`, puis `…0200_ticketing_core.sql`, `…0300_stripe_fulfillment.sql`,
   `…0400_order_email.sql`, `…0500_scan_admin.sql`. Chaque exécution doit finir sans erreur.
2. Colle et exécute les tests : `supabase/tests/002_rls_ticketing.sql` puis `supabase/tests/002_rules.sql`
   (chacun doit afficher `ALL OK` dans les messages).
3. Colle et exécute `supabase/tests/002_verify.sql` : le tableau ne doit contenir **aucune ligne `ÉCHEC`**.
4. Auth → **URL Configuration** : Site URL = l'URL de Preview ; Redirect URLs = `https://<preview>/**` et `http://localhost:3000/**`.
5. Auth → **Providers → Email** : « Confirm email » activé, longueur minimale du mot de passe 8.
6. Auth → **Email Templates** : colle les deux gabarits de `supabase/README.md` (confirmation + mot de passe oublié).
7. (Recommandé) Auth → **SMTP Settings** : voir `MISE-EN-LIGNE.md` §3 (sinon Supabase n'envoie qu'aux membres de l'équipe).

## 2. Variables de la Preview (Vercel → Settings → Environment Variables → coche **Preview**, branche `billetterie`)

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase test → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | même page → clé `anon` (ou clé « publishable ») |
| `SUPABASE_SERVICE_ROLE_KEY` | même page → clé `service_role` (ou « secret »). **Secrète.** |
| `STRIPE_SECRET_KEY` | Stripe (mode test) → Développeurs → Clés API → `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | rempli à l'étape 4 (`whsec_…`) |
| `TICKET_HMAC_SECRET` | `openssl rand -base64 32` (une valeur propre à la Preview) |
| `MAIL_FROM` | `La Sunshines <billets@ton-domaine-verifie>` |
| `NEXT_PUBLIC_SITE_URL` | l'URL de Preview stable, avec `https://`, sans `/` final |
| `RESEND_API_KEY` | ta clé Resend |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | injectées si le store KV est lié au projet **pour Preview** (obligatoire : sans KV, l'inscription et le paiement sont refusés — protection anti-abus) |

⚠️ `VERCEL_ENV=preview` est posé par Vercel : **une clé Stripe live (`sk_live_`) fait refuser le démarrage** de la Preview. C'est voulu.

Redéploie la Preview après avoir ajouté les variables (Deployments → ⋯ → Redeploy).

## 3. Vérification rapide (sans rien écrire)

```bash
npm run smoke -- https://<preview>            # + SMOKE_BYPASS=<secret> si la Preview est protégée par Vercel
```
Attendu : `✔ TOUT OK`, avec l'avertissement « Mode billetterie interne INACTIF/ACTIF » selon le flag.

## 4. Webhook Stripe (mode test) vers la Preview

Stripe (mode test) → Développeurs → **Webhooks** → Ajouter un endpoint :
- URL : `https://<preview>/api/stripe/webhook`
  - Si la Preview est protégée par Vercel (401), ajoute le contournement : Vercel → Settings → Deployment Protection →
    *Protection Bypass for Automation* → copie le secret, puis utilise l'URL
    `https://<preview>/api/stripe/webhook?x-vercel-protection-bypass=<secret>`.
- Événements à cocher (exactement ces 3) : `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`.
- Copie le **Signing secret** (`whsec_…`) → variable `STRIPE_WEBHOOK_SECRET` de la Preview → redéploie.

*Alternative locale* : `stripe listen --forward-to localhost:3000/api/stripe/webhook` affiche un `whsec_…` local à mettre dans `.env.local`.

## 5. Comptes et configuration

1. Sur la Preview : `/inscription` → crée **4 comptes** avec de vraies boîtes mail : `admin`, `staff` (porte), `client1`, `client2`. Confirme chaque email.
2. SQL Editor (Supabase test) — donne les rôles (jamais automatique) :
   ```sql
   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'EMAIL_ADMIN');
   update public.profiles set role = 'staff' where id = (select id from auth.users where email = 'EMAIL_STAFF');
   ```
3. Connecté en admin : `/admin` (mot de passe habituel) → ouvre une **édition à venir** → bloc **Billetterie** en bas :
   début (heure de Guadeloupe), capacité 20, statut **Publié**, coche « Billetterie activée » → Enregistrer, puis 2 tarifs :
   `Standard` 15,00 € stock 10 (max 4/commande) et `Early` 10,00 € stock 3.
4. `/admin/billetterie` → bouton **Billetterie interne** → confirme. La page événement affiche maintenant le panneau de tarifs.

## 6. Scénarios à dérouler (coche chaque ligne)

| # | Scénario | Comment | Résultat attendu |
|---|---|---|---|
| 1 | **Achat réussi** | client1 : page événement → 2 × Standard, noms des participants, coche CGV + autorisation parentale → Payer. Carte `4242 4242 4242 4242`, date future, CVC quelconque | Retour sur `/commande/succes` (« Paiement confirmé »). Stripe → Paiements : 30,00 €. |
| 2 | **Webhook** | Stripe → Webhooks → ton endpoint → onglet *Tentatives* | `checkout.session.completed` répondu **200**. Rejouer l'événement (⋯ → Renvoyer) : **aucun** billet en plus. |
| 3 | **Email reçu** | boîte de client1 (regarde les spams) | Email « Tes billets — … » avec 2 QR, mention « TVA non applicable, art. 293 B du CGI ». |
| 4 | **Billet + QR** | client1 → menu compte → *Mes billets* → un billet | Page du billet : QR, événement, date, lieu, tarif, nom du participant ; bouton *Télécharger le billet* (PNG). |
| 5 | **Isolation** | client2 ouvre l'URL du billet de client1 | 404. |
| 6 | **Scan valide** | staff, **sur téléphone** (HTTPS) : `/admin/scan` → autorise la caméra → scanne le QR (depuis l'email ou la page du billet) | Plein écran **VERT « VALIDE »** ; compteur « 1 / 2 entrés ». |
| 7 | **Scan répété** | scanne le même QR | Plein écran **ROUGE « DÉJÀ SCANNÉ »** avec l'heure du premier scan. |
| 8 | **Code invalide** | saisie manuelle : `ABCD-EFGH` | **ROUGE « INVALIDE »**. |
| 9 | **Carte refusée** | client2 : carte `4000 0000 0000 0002` | Stripe affiche « carte refusée » ; **aucun** billet ; la commande reste *En attente* puis *Expirée*. Retour arrière (bouton « retour ») → `/commande/annulee` : places libérées. |
| 10 | **Authentification 3-D Secure** (optionnel) | carte `4000 0027 6000 3184` | Écran d'authentification Stripe, puis achat réussi. |
| 11 | **Session expirée / paiement tardif** | client1 démarre un achat de **toutes les places Early (3)** sans payer ; attends **16 min** (la réservation de 15 min expire) ; client2 achète les 3 places Early et paie ; puis client1 **paie** (l'onglet Stripe est encore ouvert) | Places libérées à 15 min sans intervention (vérifie sur la page). Le paiement tardif de client1 est **remboursé automatiquement en totalité** ; email « commande non confirmée ». |
| 12 | **Session expirée (Stripe)** | un checkout abandonné : après 30 min Stripe envoie `checkout.session.expired` | La commande passe *Expirée* (Admin → Commandes). |
| 13 | **Remboursement partiel depuis l'admin** | admin : `/admin/billetterie/commandes` → commande de l'étape 1 → montant `5,00` + coche un billet → *Remboursement partiel* | Stripe → Remboursements : 5,00 € ; commande *Partiellement remboursée* ; le billet coché est annulé (le scanner le refuse). |
| 14 | **Remboursement total depuis l'admin** | même commande → *Rembourser le total restant* | Commande *Remboursée* (frais de service compris), billets non scannés *Remboursés*. Cliquer deux fois vite : **un seul** remboursement. |
| 15 | **Remboursement depuis le Dashboard Stripe** | fais un nouvel achat, puis Stripe → Paiements → le paiement → *Rembourser* | Webhook `charge.refunded` 200 ; la commande passe *Remboursée* dans l'admin, billets *Remboursés*. |
| 16 | **Renvoi d'email** | admin → commande → *Renvoyer l'email de billets* | Email reçu ; statut d'envoi visible (`sent`). Coupe `RESEND_API_KEY` pour voir un échec : le billet reste dans « Mes billets ». |
| 17 | **Invitation** | admin → `/admin/billetterie/invitations` → une invitation vers un de tes emails | Email de billets reçu, billet scannable, commande « Invitation » à 0 €. |
| 18 | **Exports** | admin → `/admin/billetterie` → *CSV participants* / *CSV commandes* | Fichiers ouvrables dans Excel (accents OK), **sans** codes de billets. |
| 19 | **Retour arrière** | `/admin/billetterie` → **Bizouk** | Le panneau disparaît, le widget Bizouk revient, `/api/checkout` répond 403. |

## 7. Nettoyage (base de test)

Rien à nettoyer côté prod. Sur la base de test, tu peux la réinitialiser en exécutant `supabase/down/00X_down.sql` (5 → 2, après avoir décommenté la ligne de confirmation) puis en rejouant les migrations.
