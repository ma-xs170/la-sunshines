-- =====================================================================
-- Migration 006 — profils manquants
-- Les comptes créés AVANT la migration 001 n'ont pas de ligne dans public.profiles (le trigger
-- on_auth_user_created ne s'applique qu'aux nouvelles inscriptions). On leur crée un profil
-- « customer » (jamais un rôle élevé). Idempotent.
-- =====================================================================
insert into public.profiles (id, first_name, last_name, phone)
select u.id,
       left(coalesce(nullif(u.raw_user_meta_data ->> 'first_name', ''), u.raw_user_meta_data ->> 'given_name',  ''), 60),
       left(coalesce(nullif(u.raw_user_meta_data ->> 'last_name',  ''), u.raw_user_meta_data ->> 'family_name', ''), 60),
       left(coalesce(u.raw_user_meta_data ->> 'phone', ''), 25)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
