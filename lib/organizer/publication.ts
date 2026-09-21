// Publication d'un évènement créé en ligne : libellés et règles PURS (testés). Les contrôles réels sont refaits en SQL (org_request_publication / admin_review_publication).
export type CheckKey = 'description' | 'date' | 'venue' | 'visual' | 'tickets';
export type Checklist = Record<CheckKey, boolean>;
export type PubStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export const CHECK_LABEL: Record<CheckKey, string> = { description: 'Description de l’évènement (20 caractères minimum)', date: 'Date à venir', venue: 'Lieu', visual: 'Visuel (flyer ou vidéo)', tickets: 'Tarifs ou widget de billetterie' };
export const STATUS_LABEL: Record<PubStatus, string> = { pending: 'En attente de validation', approved: 'Publié', rejected: 'Refusé', cancelled: 'Annulée' };
export const MODE_LABEL_TICKETS: Record<'internal' | 'bizouk' | 'none', string> = { internal: 'Au moins un tarif actif', bizouk: 'Code Bizouk valide', none: 'Aucune billetterie (évènement d’information)' };

/** Où corriger chaque point manquant (pages de l'espace organisateur). */
export function checkHref(key: CheckKey, slug: string, mode: 'internal' | 'bizouk' | 'none'): string {
  const base = `/organisateur/evenements/${slug}`;
  switch (key) {
    case 'description': return `${base}/description`;
    case 'date': return `${base}/sessions`;
    case 'venue': return `${base}/lieux`;
    case 'visual': return `${base}/visuel`;
    case 'tickets': return mode === 'internal' ? `${base}?onglet=tarifs` : `${base}/billetterie`;
  }
}

export const missingChecks = (c: Checklist): CheckKey[] => (Object.keys(CHECK_LABEL) as CheckKey[]).filter((k) => !c[k]);
export const isReady = (c: Checklist): boolean => missingChecks(c).length === 0;

/** Adresses de destination des notifications : en TEST (défaut) tout part vers l'adresse de Mathis ; l'envoi réel exige PUBLICATION_MAIL_LIVE=1. */
export const TEST_MAIL_TO = 'mdn.productions170@gmail.com';
export function mailRecipients(real: string[], live: boolean): { to: string[]; redirected: boolean } {
  const clean = [...new Set(real.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  return live && clean.length ? { to: clean, redirected: false } : { to: [TEST_MAIL_TO], redirected: true };
}
