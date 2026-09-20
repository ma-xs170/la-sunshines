# RGPD — demandes des personnes (procédure manuelle)

Les textes publics ne promettent **aucune purge automatique**. Ce document décrit ce que tu fais quand quelqu'un écrit à
`themouv2.0971@gmail.com`. À exécuter dans Supabase > SQL Editor (ou avec la connexion directe). Vérifie l'identité de la personne
(réponse depuis l'adresse email du compte) avant toute action.

## Accès / export
```sql
select p.*, u.email from public.profiles p join auth.users u on u.id = p.id where u.email = 'adresse@exemple.fr';
select o.order_number, o.status, o.total_cents, o.created_at from public.orders o where o.user_id = (select id from auth.users where email = 'adresse@exemple.fr');
select t.holder_first_name, t.holder_last_name, t.status from public.tickets t where t.user_id = (select id from auth.users where email = 'adresse@exemple.fr');
```
(Ou `/admin/billetterie/commandes` > CSV commandes / CSV participants.)

## Suppression du compte
```sql
delete from auth.users where email = 'adresse@exemple.fr';
```
Le profil est supprimé en cascade. Les commandes et billets **restent** (obligation comptable de 10 ans), mais `user_id` passe à `null` : ils ne sont plus
rattachés à un compte. Si la personne demande aussi l'effacement de son nom sur les commandes, à faire au cas par cas, en gardant montants et dates.

## Contrôle périodique conseillé (une fois par an)
- Comptes sans commande et sans connexion récente : `select id, email, last_sign_in_at from auth.users where last_sign_in_at < now() - interval '3 years';`
- Commandes de plus de 10 ans : suppression manuelle possible, après export comptable.
- Messages de contact : ce sont des emails dans la boîte de l'association ; à supprimer manuellement.
