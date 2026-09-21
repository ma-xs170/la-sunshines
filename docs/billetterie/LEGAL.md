# Cohérence légale — points à trancher avant l'ouverture

> Ce document signale des incohérences entre les informations déjà présentes sur le site et la billetterie interne.
> Ce n'est **pas un avis juridique** : fais relire les textes par un professionnel (et ton comptable pour la TVA).

## A. Ce qui est en place

- `/cgv` (CGV) et `/remboursement` (politique de remboursement) existent, sont **invisibles (404) tant que le flag est sur Bizouk**,
  et sont liés depuis le panneau de réservation (avec les **mentions légales**), ainsi que les cases à cocher CGV + autorisation parentale.
- Le vendeur, le SIRET et l'adresse des CGV sont **repris des mentions légales** existantes : association **THE MOUV**
  (loi 1901), SIRET 106 659 956 00010, 1 Morne Caruel, Cité Deboisvieux, 97139 Les Abymes ; contact `themouv2.0971@gmail.com` ;
  site édité par **LAWCY MUSIC** (SIRET 107 145 534 00015).
- Mention **« TVA non applicable, article 293 B du CGI »** : page de paiement Stripe, panneau de réservation, email, CGV.

## B. Incohérences et points ouverts

| # | Sujet | Constat | À faire |
|---|---|---|---|
| 1 | **Mentions légales — § Billetterie** | Dit que la billetterie est assurée par **Bizouk** et que les conditions de vente « relèvent de Bizouk ». Faux dès que le flag passe sur « interne ». | **Fait (20/09/2026)** : la page suit le réglage — texte Bizouk tant que le flag est sur Bizouk, texte billetterie interne (THE MOUV, Stripe, CGV, TVA 293 B) une fois activé. |
| 2 | **Politique de confidentialité** | Dit « site vitrine : **aucune création de compte** », ne mentionne ni comptes, ni commandes, ni **données de participants mineurs**, ni Supabase / Stripe / Resend. § 6 « Billetterie (Bizouk) » obsolète. | **Fait (20/09/2026)** : comptes, commandes, participants mineurs, Supabase / Stripe / Resend / Vercel, durées, transferts hors UE. Textes à faire relire. |
| 3 | **Qui vend ?** | Les mentions disent que la billetterie relève de **THE MOUV** ; le site est édité par **LAWCY MUSIC**. | Confirmer que **le compte Stripe** (et son IBAN, nom sur relevé, détails publics) appartient bien à l'entité qui vend (THE MOUV d'après les CGV). |
| 4 | **TVA « art. 293 B »** | Cette mention vise la franchise en base des entreprises. Une **association** peut relever d'un autre régime (non-assujettie / exonérée). Tu m'as demandé la mention 293 B : elle est en place. | À faire confirmer par ton comptable ; si le régime diffère, la mention est à changer (CGV, Stripe, email, panneau). |
| 5 | **Médiateur de la consommation** | Absent de tout le site ; **obligatoire** pour vendre à des consommateurs. `/cgv` contient `[COORDONNÉES DU MÉDIATEUR — À COMPLÉTER]` (visible une fois le flag activé). | Adhérer à un médiateur et compléter l'article 9 des CGV. **Bloquant.** |
| 6 | **Responsable de la publication** | « **Mathis** » : prénom seul. | Reste **[NOM DE FAMILLE — À COMPLÉTER]** dans `app/mentions-legales/page.tsx`. |
| 7 | **Hébergement** | Seul Vercel est cité ; les données (comptes, commandes) sont désormais chez **Supabase** (région à préciser). | **Fait** (Supabase cité) ; reste **[RÉGION DU PROJET SUPABASE — À COMPLÉTER]** (mentions légales + confidentialité). |
| 8 | **Canaux de vente en double** | Après activation, restent visibles : bouton « **Préventes Bizouk & Kiwol** » (bandeau d'accueil `CtaBand`, cartes d'éditions `EditionCard`), ligne « Préventes Bizouk & Kiwol » de `Infos`. | Décision commerciale : retirer, ou garder si tu vends encore sur ces plateformes. ⚠ Le **stock interne est indépendant de celui de Bizouk** : mets la capacité interne = places restantes hors Bizouk pour éviter la survente. |
| 9 | **Assistant (chatbot)** | `lib/assistant.ts` affirme que les remboursements se font « directement auprès de Bizouk » et que la vente est sur « Bizouk et Kiwol ». | Adapter le prompt à la nouvelle politique (`/remboursement`). |
| 10 | **Règlement (`/interdits`)** | « Exclusion immédiate, **sans remboursement** » : cohérent avec la politique de remboursement. « Billet + pièce d'identité » à l'entrée : le scan QR s'ajoute, sans contradiction. | Rien. |
| 11 | **Domaine d'envoi des emails** | Le site utilise `la-sunshines.vercel.app` ; l'adresse de contact est un **Gmail**. Resend et le SMTP Supabase exigent un **domaine que tu possèdes** (DNS). | Acheter/utiliser un domaine, le vérifier dans Resend (bloquant pour les emails vers les clients). |
| 12 | **Mineurs** | Les billets concernent des 12–17 ans ; les CGV et une case dédiée exigent que l'acheteur soit le représentant légal ou ait l'autorisation parentale. Les noms des participants mineurs sont stockés. | **Fait** : collecte des noms des participants (dont mineurs) et durées décrites dans la confidentialité ; case « J’ai 18 ans ou l’autorisation de mon représentant légal » au paiement. |

## C. Textes proposés (à faire relire) — désormais intégrés aux pages, conservés ici pour référence

**Mentions légales — remplacer le § « Billetterie » :**
> La vente de billets pour les soirées LA SUNSHINES est assurée directement par l'association THE MOUV via la billetterie en ligne de ce site
> (paiement sécurisé par Stripe). Les conditions de vente figurent dans les [Conditions générales de vente](/cgv) et la
> [politique de remboursement](/remboursement). [Le cas échéant : des préventes peuvent aussi être proposées par Bizouk et Kiwol, selon leurs propres conditions.]

**Politique de confidentialité — remplacer « site vitrine : aucune création de compte » par :**
> Le site permet de créer un compte pour acheter des billets. Nous collectons alors : adresse email, nom, prénom, numéro de téléphone (compte) ;
> commandes, billets, **noms et prénoms des participants** (dont des mineurs) ; historique d'entrée (date/heure du scan du billet).
> Finalités : gérer la commande, émettre et contrôler les billets, assurer la sécurité de l'événement, répondre aux demandes, respecter les obligations comptables.
> Base légale : exécution du contrat ; obligation légale (conservation comptable, **10 ans** pour les pièces de vente) ; intérêt légitime (sécurité, lutte contre la fraude).
> Conservation : compte tant que la suppression n'est pas demandée ; commandes et billets 10 ans (obligation comptable), sans purge automatique (voir `docs/billetterie/RGPD.md`).
> Destinataires / sous-traitants : **Supabase** (base de données et authentification — région : [À PRÉCISER]), **Stripe** (paiement ; Stripe est responsable de traitement de vos données bancaires, que nous ne recevons jamais),
> **Resend** (envoi des emails), **Vercel** (hébergement). Certains transferts hors UE reposent sur les clauses contractuelles types.
> Mineurs : les achats sont réalisés par un représentant légal ou avec son autorisation.

**Politique de confidentialité — § 6 :** remplacer « Billetterie (Bizouk) » par « Billetterie » en citant Stripe (paiement) et, le cas échéant, Bizouk / Kiwol pour leurs propres ventes.
