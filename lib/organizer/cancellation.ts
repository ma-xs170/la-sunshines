// Annulation d'un évènement : types, libellés, remplissage des modèles. Fonctions PURES (testées).
// Le contrôle réel (rôle propriétaire, évènement annulable, raison, message) est refait côté serveur (fonction SQL org_cancel_event).
import { formatGp } from '@/lib/ticketing/time';

export type CancelMode = 'cancel' | 'replace';
export type ReasonCode = 'weather' | 'permit' | 'low_sales' | 'other';

export const REASON_OPTIONS: { value: ReasonCode; label: string }[] = [
  { value: 'weather', label: 'Météo' },
  { value: 'permit', label: 'Autorisation refusée ou retirée' },
  { value: 'low_sales', label: 'Vente insuffisante' },
  { value: 'other', label: 'Autre' },
];
export const REASON_LABEL: Record<ReasonCode, string> = Object.fromEntries(REASON_OPTIONS.map((o) => [o.value, o.label])) as Record<ReasonCode, string>;
export const isReasonCode = (v: string): v is ReasonCode => REASON_OPTIONS.some((o) => o.value === v);

export interface Template { subject: string; body: string; source: 'default' | 'organization' }
export type Templates = Record<ReasonCode, Template>;

export interface CancelEventInfo { slug: string; status: string; starts_at: string; venue: string; title: string; organizer_name: string; reply_to: string }
export interface CancelImpact { paid_orders: number; refund_cents: number; valid_tickets: number; recipients: number; pending_orders: number }
export interface ReplacementOption { slug: string; title: string; starts_at: string; venue: string }
export interface CancelContext {
  event: CancelEventInfo;
  cancellable: boolean;
  cancelled: boolean;
  impact: CancelImpact;
  replacements: ReplacementOption[];
  templates: Templates;
}

export interface CancellationMessage { id: string; subject: string; body: string; status: 'sending' | 'sent' | 'partial' | 'failed'; recipient_count: number; sent_count: number; failed_count: number; last_error: string | null }
export interface RefundRemaining { id: string; number: string; remaining_cents: number }
export interface CancellationState {
  id: string; mode: CancelMode; reason: ReasonCode; reason_detail: string; created_at: string;
  replacement: { slug: string; title: string; starts_at: string; venue: string } | null;
  tickets_cancelled: number; refund_cents_planned: number; refund_remaining: RefundRemaining[]; refunded_cents: number;
  message: CancellationMessage | null;
}

/** Remplace {evenement} {date} {lieu} {organisateur} par les informations réelles de l'évènement. */
export function fillTemplate(text: string, ev: { title: string; starts_at: string; venue: string; organizer_name: string }): string {
  return text
    .replaceAll('{evenement}', ev.title)
    .replaceAll('{date}', formatGp(ev.starts_at))
    .replaceAll('{lieu}', ev.venue || 'à confirmer')
    .replaceAll('{organisateur}', ev.organizer_name);
}

/** Message pré-rempli pour une raison : modèle rempli avec les infos réelles, et, en mode remplacement, un paragraphe
 *  ajouté automatiquement mentionnant le nouvel évènement (l'organisateur peut ensuite tout modifier librement). */
export function buildDefaultMessage(template: Template, ev: CancelEventInfo, replacement: ReplacementOption | null): { subject: string; body: string } {
  const subject = fillTemplate(template.subject, ev);
  let body = fillTemplate(template.body, ev);
  if (replacement) {
    body += `\n\nPour ne pas vous laisser sur cette déception, nous vous invitons à « ${replacement.title} », le ${formatGp(replacement.starts_at)}${replacement.venue ? ' à ' + replacement.venue : ''}. Votre commande pour « ${ev.title} » vous sera remboursée séparément.`;
  }
  return { subject, body };
}

/** Étape 3 valide : raison choisie (détail obligatoire si « Autre »), sujet et message non vides. */
export function step3Errors(reason: ReasonCode | '', detail: string, subject: string, body: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!reason) e.reason = 'Choisis une raison.';
  else if (reason === 'other' && detail.trim().length < 5) e.detail = 'Précise la raison (5 caractères minimum).';
  if (!subject.trim()) e.subject = 'L’objet est obligatoire.';
  if (!body.trim()) e.body = 'Le message est obligatoire.';
  else if (body.length > 2000) e.body = 'Le message est trop long (2000 caractères maximum).';
  return e;
}

/** Étape 1 valide : mode choisi, remplacement choisi si mode = « replace ». */
export function step1Errors(mode: CancelMode | '', replacement: string, hasReplacements: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!mode) e.mode = 'Choisis une option.';
  else if (mode === 'replace' && (!replacement || !hasReplacements)) e.replacement = 'Choisis l’évènement de remplacement.';
  return e;
}
