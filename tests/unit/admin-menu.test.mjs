import test from 'node:test';
import assert from 'node:assert/strict';
import { adminMenu, visibleAdminMenu, isAdminActive, activeAdminGroup, adminCrumbs } from '../../lib/admin/menu.ts';

test('le menu admin contient toutes les rubriques demandées', () => {
  const labels = adminMenu().map((g) => g.label);
  for (const l of ['Tableau de bord', 'Organisateurs', 'Évènements', 'Administrateurs', 'Support', 'Calendrier', 'Billetterie', 'Contenu du site', 'Journal d’audit', 'Réglages']) assert.ok(labels.includes(l), l);
  const support = adminMenu().find((g) => g.id === 'support').items.map((i) => i.label);
  assert.deepEqual(support, ['Tous', 'Problème technique', 'Gestion du compte', 'Argent & paiement', 'Demandes de nouveautés', 'Autre', 'Mes tickets', 'Fermés']);
});
test('Administrateurs est réservé au super-admin', () => {
  assert.ok(!visibleAdminMenu(adminMenu(), false).some((g) => g.id === 'admins'));
  assert.ok(visibleAdminMenu(adminMenu(), true).some((g) => g.id === 'admins'));
});
test('entrée active selon le chemin et les paramètres', () => {
  const g = adminMenu();
  assert.ok(isAdminActive('/admin/gestion/support?categorie=money', '/admin/gestion/support', new URLSearchParams('categorie=money')));
  assert.ok(!isAdminActive('/admin/gestion/support', '/admin/gestion/support', new URLSearchParams('categorie=money')));
  assert.equal(activeAdminGroup(g, '/admin/contenu', new URLSearchParams('onglet=artists')), 'content');
  assert.equal(activeAdminGroup(g, '/admin', new URLSearchParams()), 'dashboard');
});
test('fil d’Ariane', () => {
  assert.deepEqual(adminCrumbs('/admin/gestion/organisateurs').map((c) => c.label), ['Administration', 'Organisateurs']);
});
