// Menus de l'espace organisateur : deux contextes (compte / évènement). Fonctions PURES (testées).
// Règle : une entrée sans `href` est une page « Bientôt disponible » : affichée grisée, jamais cliquable.
// Les rôles filtrent l'AFFICHAGE ; le contrôle réel reste côté serveur (routes /api/organisateur/*, fonctions SQL org_*).
import type { IconName } from '@/components/Icon';

/** Capacité requise (voir roles.ts) : redéclarée en type pour garder ce fichier sans import relatif (testable tel quel par node). */
export type Capability = 'scan' | 'manage' | 'owner';

export interface MenuLeaf { label: string; href?: string; cap: Capability; badge?: 'news' }
export interface MenuGroup { id: string; label: string; icon: IconName; items: MenuLeaf[]; sub?: { after: number; label: string } }

const SLUG = /^\/organisateur\/evenements\/([a-z0-9][a-z0-9-]{0,80})(?:\/|$)/;
const RESERVED = new Set(['nouveau']);

/** Slug de l'évènement ouvert, ou null : c'est ce qui fait basculer le menu du contexte « compte » au contexte « évènement ». */
export function eventSlugOf(pathname: string): string | null {
  const m = SLUG.exec(pathname);
  return m && !RESERVED.has(m[1]) ? m[1] : null;
}

export function accountMenu(): MenuGroup[] {
  return [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'grid', items: [{ label: 'Tableau de bord', href: '/organisateur', cap: 'scan' }] },
    { id: 'events', label: 'Mes évènements', icon: 'ticket', items: [
      { label: 'Tous mes évènements', href: '/organisateur/evenements', cap: 'scan' },
      { label: 'Participants', href: '/organisateur/participants', cap: 'manage' },
      { label: 'Analyse', href: '/organisateur/analyse', cap: 'manage' },
    ] },
    { id: 'calendar', label: 'Calendrier', icon: 'calendar', items: [{ label: 'Calendrier régional' , cap: 'manage' }] },
    { id: 'org', label: 'Mon organisation', icon: 'shield', items: [
      { label: 'Informations légales', href: '/organisateur/parametres', cap: 'owner' },
      { label: 'Membres et rôles', cap: 'owner' },
      { label: 'Compte de versement', href: '/organisateur/paiements', cap: 'owner' },
      { label: 'Page publique', cap: 'manage' },
    ] },
    { id: 'support', label: 'Support', icon: 'help', items: [
      { label: 'Créer un ticket', cap: 'manage' },
      { label: 'Historique du support', cap: 'manage' },
    ] },
    { id: 'news', label: 'Actualités', icon: 'bell', items: [{ label: 'Actualités', href: '/organisateur/actualites', cap: 'scan', badge: 'news' }] },
    { id: 'help', label: 'Centre d’aide', icon: 'inbox', items: [{ label: 'Centre d’aide', href: '/organisateur/aide', cap: 'scan' }] },
  ];
}

export function eventMenu(slug: string): MenuGroup[] {
  const base = `/organisateur/evenements/${slug}`;
  const tab = (t: string) => `${base}?onglet=${t}`;
  return [
    { id: 'ev-dashboard', label: 'Tableau de bord', icon: 'grid', items: [{ label: 'Tableau de bord', href: base, cap: 'scan' }] },
    { id: 'ev-event', label: 'Évènement', icon: 'sparkles', items: [
      { label: 'Description', href: `${base}/description`, cap: 'manage' }, { label: 'Décliner le flyer', href: `${base}/flyer`, cap: 'manage' },
      { label: 'Lieux', href: `${base}/lieux`, cap: 'manage' }, { label: 'Sessions', href: `${base}/sessions`, cap: 'manage' },
      { label: 'Formulaires', href: `${base}/formulaires`, cap: 'manage' }, { label: 'Lineup', cap: 'manage' },
      { label: 'Conditions générales', href: `${base}/conditions`, cap: 'manage' }, { label: 'Consentements RGPD', href: `${base}/consentements`, cap: 'manage' },
    ] },
    { id: 'ev-tickets', label: 'Billetterie', icon: 'ticket', items: [
      { label: 'Tarifs', href: tab('tarifs'), cap: 'manage' }, { label: 'Codes de réduction', href: `${base}/promos`, cap: 'manage' }, { label: 'Remboursements', href: `${base}/remboursements`, cap: 'manage' }, { label: 'Frais et paiement', cap: 'manage' },
    ] },
    { id: 'ev-sales', label: 'Ventes', icon: 'list', sub: { after: 2, label: 'Distribuer' }, items: [
      { label: 'Participants', href: tab('participants'), cap: 'manage' }, { label: 'Commandes', href: `${base}/commandes`, cap: 'manage' },
      { label: 'Envoyer des invitations', href: `${base}/invitations`, cap: 'manage' }, { label: 'Suivi des invitations', href: `${base}/invitations/suivi`, cap: 'manage' }, { label: 'Imprimer des billets', cap: 'manage' }, { label: 'Exporter les billets', href: `/api/organisateur/events/${slug}/export`, cap: 'manage' },
    ] },
    { id: 'ev-staff', label: 'Staff', icon: 'history', items: [
      { label: 'Liste du staff', cap: 'manage' }, { label: 'Présences', cap: 'manage' }, { label: 'QR codes de connexion', cap: 'manage' },
    ] },
    { id: 'ev-access', label: 'Contrôle d’accès', icon: 'scan', items: [
      { label: 'Scan à l’entrée', href: tab('scan'), cap: 'scan' }, { label: 'Liste d’entrée', cap: 'scan' }, { label: 'Historique des scans', href: `${base}/scans`, cap: 'manage' },
    ] },
    { id: 'ev-comm', label: 'Communication', icon: 'mail', items: [
      { label: 'Envoyer un message aux participants', cap: 'manage' }, { label: 'Renvoyer les billets', cap: 'manage' },
    ] },
    { id: 'ev-marketing', label: 'Marketing', icon: 'share', items: [{ label: 'Codes promo et liens de suivi', cap: 'manage' }] },
    { id: 'ev-media', label: 'Médias', icon: 'grid', items: [{ label: 'Photos', cap: 'manage' }, { label: 'Vidéos', cap: 'manage' }] },
    { id: 'ev-stats', label: 'Statistiques', icon: 'filter', items: [
      { label: 'Vue d’ensemble', cap: 'manage' }, { label: 'Audience', cap: 'manage' }, { label: 'Acquisition', cap: 'manage' }, { label: 'Tunnel de conversion', cap: 'manage' },
      { label: 'Ventes', cap: 'manage' }, { label: 'Participants', cap: 'manage' }, { label: 'Canaux', cap: 'manage' }, { label: 'Géographie', cap: 'manage' }, { label: 'Performance', cap: 'manage' },
    ] },
    { id: 'ev-finance', label: 'Finance', icon: 'check', items: [
      { label: 'Récapitulatif', href: '/organisateur/paiements', cap: 'owner' }, { label: 'Versements', cap: 'owner' },
    ] },
    { id: 'ev-users', label: 'Utilisateurs', icon: 'phone', items: [{ label: 'Rôles de l’évènement', cap: 'owner' }] },
    { id: 'ev-notif', label: 'Notifications', icon: 'bell', items: [{ label: 'Notifications', cap: 'manage' }] },
  ];
}

/** Menu filtré par rôle : une entrée dont la capacité n'est pas accordée disparaît, un groupe vide aussi. */
export function visibleMenu(groups: MenuGroup[], allowed: (cap: Capability) => boolean): MenuGroup[] {
  return groups
    .map((g) => {
      const kept = g.items.filter((i) => allowed(i.cap));
      // le sous-titre « Distribuer » suit la position d'origine : on la recalcule sur les entrées gardées
      const sub = g.sub ? { ...g.sub, after: g.items.slice(0, g.sub.after).filter((i) => allowed(i.cap)).length } : undefined;
      return { ...g, items: kept, sub: sub && sub.after < kept.length && sub.after > 0 ? sub : undefined };
    })
    .filter((g) => g.items.length > 0);
}

/** Entrée active : même chemin et, quand l'entrée porte `?onglet=`, même onglet ; sans onglet demandé, l'entrée sans onglet. */
export function isActiveHref(href: string | undefined, pathname: string, onglet: string | null): boolean {
  if (!href) return false;
  const [path, query = ''] = href.split('?');
  const wanted = new URLSearchParams(query).get('onglet');
  if (path !== pathname) return false;
  return wanted ? wanted === onglet : !onglet;
}

/** Groupe à ouvrir au chargement : celui qui contient l'entrée active (une seule section ouverte à la fois). */
export function activeGroupId(groups: MenuGroup[], pathname: string, onglet: string | null): string | null {
  return groups.find((g) => g.items.some((i) => isActiveHref(i.href, pathname, onglet)))?.id ?? null;
}

const CRUMB: Record<string, string> = {
  evenements: 'Mes évènements', nouveau: 'Nouvel évènement', participants: 'Participants', analyse: 'Analyse', paiements: 'Paiements',
  parametres: 'Informations légales', actualites: 'Actualités', aide: 'Centre d’aide',
  commandes: 'Commandes', remboursements: 'Remboursements', scans: 'Historique des scans', invitations: 'Invitations', suivi: 'Suivi', promos: 'Codes de réduction', description: 'Description', flyer: 'Décliner le flyer', lieux: 'Lieux', sessions: 'Sessions', formulaires: 'Formulaires', conditions: 'Conditions générales', consentements: 'Consentements RGPD',
};

/** Fil d'Ariane à partir du chemin (l'évènement s'affiche « Évènement » : son titre est dans l'en-tête de la page). */
export function crumbs(pathname: string): { label: string; href?: string }[] {
  const parts = pathname.replace(/^\/organisateur\/?/, '').split('/').filter(Boolean);
  const out: { label: string; href?: string }[] = [{ label: 'Espace organisateur', href: '/organisateur' }];
  let href = '/organisateur';
  parts.forEach((p, i) => {
    href += '/' + p;
    const isSlug = i === 1 && parts[0] === 'evenements' && !RESERVED.has(p);
    out.push({ label: isSlug ? 'Évènement' : CRUMB[p] ?? p, href: i === parts.length - 1 ? undefined : href });
  });
  return out;
}
