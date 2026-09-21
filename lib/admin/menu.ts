// Menu de l'espace admin (mêmes principes que lib/organizer/menu.ts : PUR, testable). Le contrôle réel reste côté serveur.
import type { IconName } from '@/components/Icon';

export interface AdminLeaf { label: string; href: string; superOnly?: boolean; badge?: 'support' | 'pending'; external?: boolean }
export interface AdminGroup { id: string; label: string; icon: IconName; items: AdminLeaf[] }

const SUP = '/admin/gestion/support';
const CONTENT = '/admin/contenu';

export function adminMenu(): AdminGroup[] {
  return [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'grid', items: [{ label: 'Tableau de bord', href: '/admin' }] },
    { id: 'orgs', label: 'Organisateurs', icon: 'shield', items: [{ label: 'Organisateurs', href: '/admin/gestion/organisateurs', badge: 'pending' }] },
    { id: 'events', label: 'Évènements', icon: 'ticket', items: [
      { label: 'Tous les évènements', href: '/admin/gestion/evenements' }, { label: 'Transférer un évènement', href: '/admin/gestion/transfert' },
    ] },
    { id: 'admins', label: 'Administrateurs', icon: 'phone', items: [{ label: 'Administrateurs', href: '/admin/gestion/administrateurs', superOnly: true }] },
    { id: 'support', label: 'Support', icon: 'help', items: [
      { label: 'Tous', href: SUP, badge: 'support' }, { label: 'Problème technique', href: `${SUP}?categorie=technical` }, { label: 'Gestion du compte', href: `${SUP}?categorie=account` },
      { label: 'Argent & paiement', href: `${SUP}?categorie=money` }, { label: 'Demandes de nouveautés', href: `${SUP}?categorie=feature` }, { label: 'Autre', href: `${SUP}?categorie=other` },
      { label: 'Mes tickets', href: `${SUP}?vue=mine` }, { label: 'Fermés', href: `${SUP}?vue=closed` },
    ] },
    { id: 'calendar', label: 'Calendrier', icon: 'calendar', items: [{ label: 'Calendrier', href: '/admin/gestion/calendrier' }] },
    { id: 'ticketing', label: 'Billetterie', icon: 'list', items: [
      { label: 'Mode et frais', href: '/admin/billetterie' }, { label: 'Commandes', href: '/admin/billetterie/commandes' }, { label: 'Invitations', href: '/admin/billetterie/invitations' },
      { label: 'Scan à l’entrée', href: '/admin/scan' }, { label: 'Aide billetterie', href: '/admin/billetterie/aide' },
    ] },
    { id: 'content', label: 'Contenu du site', icon: 'sparkles', items: [
      { label: 'Statistiques du site', href: CONTENT }, { label: 'Évènements et programme', href: `${CONTENT}?onglet=events` }, { label: 'Créer un évènement', href: `${CONTENT}?onglet=events-create` },
      { label: 'Artistes', href: `${CONTENT}?onglet=artists` }, { label: 'Vérifications', href: `${CONTENT}?onglet=verifications` }, { label: 'Annonces', href: `${CONTENT}?onglet=announcements` },
      { label: 'Demandes de contact', href: `${CONTENT}?onglet=tickets` }, { label: 'Actualités organisateurs', href: '/admin/actualites' },
    ] },
    { id: 'audit', label: 'Journal d’audit', icon: 'history', items: [{ label: 'Journal d’audit', href: '/admin/gestion/audit' }] },
    { id: 'settings', label: 'Réglages', icon: 'filter', items: [{ label: 'Réglages', href: '/admin/gestion/reglages' }] },
  ];
}

export function visibleAdminMenu(groups: AdminGroup[], isSuper: boolean): AdminGroup[] {
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.superOnly || isSuper) })).filter((g) => g.items.length > 0);
}

/** Entrée active : même chemin ; si l'entrée porte une requête (?onglet=, ?categorie=, ?vue=), elle doit correspondre ; sinon la page ne doit porter aucun de ces paramètres. */
export function isAdminActive(href: string, pathname: string, params: URLSearchParams): boolean {
  const [path, query = ''] = href.split('?');
  if (path !== pathname) return false;
  const want = new URLSearchParams(query);
  for (const k of ['onglet', 'categorie', 'vue']) if ((want.get(k) ?? '') !== (params.get(k) ?? '')) return false;
  return true;
}

export function activeAdminGroup(groups: AdminGroup[], pathname: string, params: URLSearchParams): string | null {
  return groups.find((g) => g.items.some((i) => isAdminActive(i.href, pathname, params)))?.id ?? null;
}

const CRUMB: Record<string, string> = { gestion: 'Gestion', organisateurs: 'Organisateurs', evenements: 'Évènements', transfert: 'Transfert', administrateurs: 'Administrateurs', support: 'Support', calendrier: 'Calendrier', audit: 'Journal d’audit', reglages: 'Réglages', billetterie: 'Billetterie', commandes: 'Commandes', invitations: 'Invitations', aide: 'Aide', contenu: 'Contenu du site', actualites: 'Actualités', scan: 'Scan' };
export function adminCrumbs(pathname: string): { label: string; href?: string }[] {
  const parts = pathname.replace(/^\/admin\/?/, '').split('/').filter((p) => p && p !== 'gestion');
  const out: { label: string; href?: string }[] = [{ label: 'Administration', href: '/admin' }];
  let href = '/admin' + (pathname.startsWith('/admin/gestion') ? '/gestion' : '');
  parts.forEach((p, i) => { href += '/' + p; out.push({ label: CRUMB[p] ?? 'Détail', href: i === parts.length - 1 ? undefined : href }); });
  return out;
}
