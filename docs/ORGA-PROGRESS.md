# Suivi d'avancement (à relire au début de chaque phase)

Branche : `feat/organisateur-ui`. Migrations déjà appliquées sur la base réelle : 001 → 014.
Méthode : sauvegarde JSON `~/sunshines-backups/` → migration → verify → build/tsc/tests → commit → push → (phase verte) merge main.
Scripts hors dépôt (scratchpad) : `db.mjs` (connexion, lit `.env.local`), `backup.mjs`, `apply.mjs`, `verify.mjs`.

- [x] Phase 0 : audit et décisions
- [x] Phase 1 : références ORG/ADM, menu latéral, temps réel (migration 014 appliquée)
- [x] Phase 2 : pages évènement (sauf Lineup organisateur et job de transcodage 4K : voir DECISIONS D12-D14)
  - [x] 2a libs pures + tests
  - [x] 2b migration 015 APPLIQUÉE sur la base réelle + tests SQL + verify
  - [x] 2c pages organisateur : Description, Lieux, Sessions, Formulaires, CG, RGPD, Décliner le flyer
  - [x] 2d affichage public dresscode couleurs + vidéo flyer (inerte tant que rien n'est saisi)
- [ ] Phase 3 : billetterie et ventes (promos, remboursements, commandes, distribuer, contrôle d'accès, communication)
- [ ] Phase 4 : tableau de bord, statistiques, finance, notifications
- [ ] Phase 5 : admin (administrateurs multiples, organisateurs, transfert d'évènement)
- [ ] Phase 6 : support organisateurs ↔ admins
- [ ] Phase 7 : calendrier régional et pages publiques d'organisateurs
- [ ] Vérification finale (section 11) + ORGA-RAPPORT.md
