# Billet PDF et espace organisateur

## Billet PDF
- Un billet = une page A4, aux couleurs et polices du site (Unbounded, Caveat, Inter : `assets/fonts`, licence OFL). Généré côté serveur (`@react-pdf/renderer`), moins de 500 Ko.
- Contenu : logo « La Sunshines » en haut à gauche, flyer (mise en page sans flyer sinon), QR signé grand, référence `LS-XXXXXX`, événement, date, lieu, tarif, prix payé, titulaire, bloc organisateur, mentions (TVA non applicable art. 293 B, billet nominatif, un billet = une entrée).
- Bloc organisateur : lu dans la table `organizers` (nom, SIRET, ou nom et prénom du responsable). Modifiable dans **/admin/billetterie > Organisateur**. Sans SIRET ni responsable, le billet affiche **[À COMPLÉTER]**.
- Téléchargement : `/api/tickets/<id>/pdf` (un billet) et `/api/orders/<id>/pdf` (toute la commande). Propriétaire connecté ou admin ; tout autre cas = 404 ; billet annulé ou remboursé = 410 (pas de PDF).
- L'email de confirmation joint le PDF de la commande. Si le PDF ne peut pas être généré, l'email part sans lui (le webhook n'échoue jamais).

## Espace organisateur (`/organisateur`)
- Accès : compte **admin** ou **membre d'un organisateur**. L'entrée « Organisateur » n'apparaît dans le menu compte que pour eux (le contrôle réel est refait côté serveur et dans les fonctions SQL `org_*`).
- Un organisateur ne voit QUE ses événements (fonctions SQL + politiques RLS). Les événements existants sont rattachés à **THE MOUV** ; les nouveaux, sans organisateur, aussi.
- Rôles d'un membre : `owner` / `manager` (consulter, exporter, renvoyer un billet, écrire aux participants), `viewer` (consultation seule).

### Donner l'accès à quelqu'un (SQL, Supabase > SQL Editor)
```sql
insert into public.organizer_members (organizer_id, user_id, role)
select o.id, u.id, 'manager'
from public.organizers o, auth.users u
where o.is_default and lower(u.email) = lower('adresse@exemple.fr');
-- retirer : delete from public.organizer_members where user_id = (select id from auth.users where lower(email) = lower('adresse@exemple.fr'));
```
Il n'y a pas d'inscription publique d'organisateurs.

### Messages aux participants
Information liée à l'événement uniquement (horaires, accès, consignes) : **aucune promotion, aucun lien** (refusé côté serveur), case de confirmation obligatoire, aperçu puis confirmation avant envoi, 3 messages par événement et par 24 h, 500 destinataires maximum, un email par acheteur, réponse à l'adresse de l'organisateur (sinon envoi refusé), statut par destinataire.

### RGPD
Chaque consultation de la liste (dédoublonnée sur 5 minutes), chaque export CSV, chaque envoi de message et chaque renvoi de billet est écrit dans `audit_log` (actions `organizer.*`). La politique de confidentialité indique que les organisateurs reçoivent les données des participants de leurs événements.
```sql
select created_at, actor_id, action, meta from public.audit_log where action like 'organizer.%' order by id desc limit 50;
```

## Tests
`npm run test:db` (SQL : isolation, rôles, RLS, messages), `npm run test:unit`, `npm run test:e2e` (scénario `s9` : PDF, QR du PDF accepté au scan, isolation entre organisateurs, export, messages). `PDF_OUT=/dossier node tests/e2e/pdf-sample.mjs` génère un PDF d'exemple (banc lancé).
