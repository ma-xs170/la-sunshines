# Banc de test de bout en bout (local)

`npm run test:e2e` lance : Postgres réel jetable (embedded-postgres) + PostgREST + faux GoTrue, Stripe et Resend +
l'application Next.js réelle. Scénarios : s3 (Stripe + webhook), s4 (billets QR + emails), s5 (scan + admin commandes),
s6 (pages selon le flag). Rien n'est écrit sur ta vraie base ni chez Stripe / Resend.

Prérequis : le binaire **PostgREST** (macOS Apple Silicon : `postgrest-*-macos-aarch64.tar.xz` sur
https://github.com/PostgREST/postgrest/releases) à placer dans `tests/e2e/.bin/postgrest` (ou `POSTGREST_BIN=/chemin`).
Les ports 54329-54333 et 3130 doivent être libres. `npm run test:db` (SQL + concurrence) n'a besoin d'aucun prérequis.
