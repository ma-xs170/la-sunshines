// Support organisateurs ↔ admins : constantes, libellés et validation (PURE, testée). Les droits sont revérifiés en SQL (support_*).
import { z } from 'zod';

export const CATEGORIES = [['technical', 'Problème technique'], ['account', 'Gestion du compte'], ['money', 'Argent & paiement'], ['feature', 'Demande de nouveautés'], ['other', 'Autre']] as const;
export const PRIORITIES = [['low', 'Bas'], ['medium', 'Moyen'], ['high', 'Haute'], ['urgent', 'Urgent']] as const;
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES);
export const PRIORITY_LABEL: Record<string, string> = Object.fromEntries(PRIORITIES);
export const STATUS_LABEL: Record<string, string> = { open: 'Ouvert', claimed: 'Pris en charge', closed: 'Fermé' };

export const ATTACH_MAX = 5;
export const ATTACH_BYTES = 10 * 1024 * 1024;
const OK_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;
export const attachOk = (type: string, size: number) => OK_TYPES.test(type) && size > 0 && size <= ATTACH_BYTES;

/** Libellé de statut affiché : « Pris en charge par Ada » quand un admin l'a pris. */
export const statusText = (status: string, admin: string | null | undefined) => (status === 'claimed' && admin ? `Pris en charge par ${admin}` : STATUS_LABEL[status] ?? status);

export const attachmentSchema = z.object({ path: z.string().regex(/^support\/[A-Za-z0-9._\/-]{1,200}$/).refine((p) => !p.includes('..')), name: z.string().max(120), size: z.number().int().positive().max(ATTACH_BYTES), type: z.string().regex(OK_TYPES) });
export const createSchema = z.object({
  org: z.string().uuid(), subject: z.string().trim().min(3, 'L’objet doit faire au moins 3 caractères.').max(140), category: z.enum(['technical', 'account', 'money', 'feature', 'other'], { message: 'Choisis une catégorie.' }),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], { message: 'Choisis une priorité.' }), body: z.string().trim().min(1, 'Décris ta demande.').max(5000), attachments: z.array(attachmentSchema).max(ATTACH_MAX).default([]),
  context: z.object({ page: z.string().max(200).optional(), reference: z.string().max(20).optional() }).optional(),
});
export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('post'), body: z.string().trim().min(1, 'Écris un message.').max(5000), attachments: z.array(attachmentSchema).max(ATTACH_MAX).default([]), internal: z.boolean().optional() }),
  z.object({ action: z.literal('add'), ref: z.string().trim().max(20) }),
  z.object({ action: z.literal('claim') }), z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('transfer'), to: z.string().uuid() }), z.object({ action: z.literal('close'), note: z.string().trim().max(500).default('') }),
]);
