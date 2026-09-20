// Rôles et droits de l'espace organisateur. Fonctions PURES (testées) : elles servent à l'AFFICHAGE (menus, boutons).
// Le contrôle réel est refait côté serveur (routes /api/organisateur/*) et dans les fonctions SQL org_*.

/** Rôle effectif dans une organisation : 'admin' = administrateur du site (accès à toutes les organisations). */
export type OrgRole = 'admin' | 'owner' | 'manager' | 'staff';

/** Capacités : 'scan' = tout membre ; 'manage' = tout sauf paramètres légaux / paiement ; 'owner' = paramètres légaux et paiement. */
export type Capability = 'scan' | 'manage' | 'owner';

export const ROLE_LABEL: Record<OrgRole, string> = { admin: 'Administrateur', owner: 'Propriétaire', manager: 'Gestionnaire', staff: 'Staff' };

export function can(role: string | null | undefined, cap: Capability): boolean {
  if (role === 'admin' || role === 'owner') return true;
  if (role === 'manager') return cap !== 'owner';
  if (role === 'staff') return cap === 'scan';
  return false;
}

export interface NavItem { href: string; label: string; cap: Capability }

/** Entrées de la barre du haut. « Marketing » (codes promo) viendra plus tard : aucune entrée vide en attendant. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/organisateur', label: 'Événements', cap: 'scan' },
  { href: '/organisateur/participants', label: 'Participants', cap: 'manage' },
  { href: '/organisateur/analyse', label: 'Analyse', cap: 'manage' },
  { href: '/organisateur/paiements', label: 'Paiements', cap: 'owner' },
];

export const navFor = (role: string | null | undefined): NavItem[] => NAV_ITEMS.filter((i) => can(role, i.cap));

/** Entrée active de la barre pour un chemin donné (« Événements » couvre /organisateur et /organisateur/evenements/…). */
export function activeNav(pathname: string): string | null {
  const hit = NAV_ITEMS.filter((i) => i.href !== '/organisateur').find((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
  if (hit) return hit.href;
  return pathname === '/organisateur' || pathname.startsWith('/organisateur/evenements') ? '/organisateur' : null;
}
