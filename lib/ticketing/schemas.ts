// Validation (zod) des entrées d'administration de la billetterie.

import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true, error: 'Date/heure invalide.' });
const optDate = isoDateTime.nullable();

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,98}$/;
export const slugSchema = z.string().regex(SLUG_RE, 'Identifiant d’événement invalide.');

export const EVENT_STATUSES = ['draft', 'published', 'closed', 'cancelled'] as const;

export const eventSaveSchema = z
  .object({
    starts_at: isoDateTime,
    ends_at: optDate,
    doors_open_at: optDate,
    venue_name: z.string().trim().max(120, 'Nom du lieu trop long.'),
    venue_address: z.string().trim().max(250, 'Adresse trop longue.'),
    capacity: z
      .number({ error: 'Indique la capacité.' })
      .int('La capacité doit être un nombre entier.')
      .min(1, 'La capacité doit être d’au moins 1.')
      .max(100000, 'Capacité trop élevée.'),
    sales_open_at: optDate,
    sales_close_at: optDate,
    ticketing_enabled: z.boolean(),
    status: z.enum(EVENT_STATUSES, { error: 'Statut invalide.' }),
  })
  .superRefine((v, ctx) => {
    const t = (s: string | null) => (s ? Date.parse(s) : null);
    const start = t(v.starts_at)!;
    const end = t(v.ends_at);
    const doors = t(v.doors_open_at);
    const open = t(v.sales_open_at);
    const close = t(v.sales_close_at);
    if (end !== null && end <= start)
      ctx.addIssue({ code: 'custom', message: 'La fin doit être après le début.', path: ['ends_at'] });
    if (doors !== null && doors > start)
      ctx.addIssue({ code: 'custom', message: 'L’ouverture des portes doit précéder le début.', path: ['doors_open_at'] });
    if (open !== null && close !== null && close <= open)
      ctx.addIssue({ code: 'custom', message: 'La fermeture des ventes doit être après leur ouverture.', path: ['sales_close_at'] });
  });
export type EventSaveInput = z.infer<typeof eventSaveSchema>;

export const tierSaveSchema = z
  .object({
    id: z.uuid('Identifiant de tarif invalide.').nullable().optional(),
    name: z.string().trim().min(1, 'Donne un nom au tarif.').max(80, 'Nom trop long.'),
    description: z.string().trim().max(300, 'Description trop longue.'),
    price_cents: z
      .number({ error: 'Indique un prix.' })
      .int('Le prix doit être en centimes entiers.')
      .min(50, 'Le prix minimum d’un tarif est de 0,50 €.')
      .max(1000000, 'Prix trop élevé.'),
    quantity_total: z
      .number({ error: 'Indique la quantité.' })
      .int('La quantité doit être un nombre entier.')
      .min(0, 'Quantité invalide.')
      .max(100000, 'Quantité trop élevée.'),
    max_per_order: z.number().int().min(1, 'Maximum par commande : 1 minimum.').max(20, 'Maximum par commande : 20.'),
    sales_start: optDate,
    sales_end: optDate,
    is_active: z.boolean(),
    sort_order: z.number().int().min(0).max(1000),
  })
  .superRefine((v, ctx) => {
    if (v.sales_start && v.sales_end && Date.parse(v.sales_end) <= Date.parse(v.sales_start)) {
      ctx.addIssue({ code: 'custom', message: 'La fin de vente doit être après le début.', path: ['sales_end'] });
    }
  });
export type TierSaveInput = z.infer<typeof tierSaveSchema>;

export const settingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('ticketing_mode'), value: z.enum(['bizouk', 'native']) }),
  z.object({ key: z.literal('fee_percent'), value: z.number().min(0, 'Minimum 0 %.').max(100, 'Maximum 100 %.') }),
  z.object({ key: z.literal('fee_fixed_cents'), value: z.number().int().min(0).max(5000, 'Maximum 50 €.') }),
  z.object({ key: z.literal('terms_version'), value: z.string().trim().min(1).max(40) }),
]);
export type SettingInput = z.infer<typeof settingSchema>;

// ---------------------------------------------------------------------
// Checkout : AUCUN montant ni prix en entrée — seulement des identifiants de
// tarifs, des quantités et les noms des participants. Le prix est relu en base.
// ---------------------------------------------------------------------
const personName = z.string().trim().min(1, 'Indique le prénom et le nom de chaque participant.').max(60, 'Nom trop long.');

export const checkoutSchema = z
  .object({
    slug: slugSchema,
    items: z
      .array(
        z.object({
          tier_id: z.uuid('Tarif invalide.'),
          quantity: z.number().int('Quantité invalide.').min(1, 'Quantité invalide.').max(20, 'Quantité trop élevée.'),
          participants: z.array(z.object({ first_name: personName, last_name: personName })).min(1).max(20),
        }),
      )
      .min(1, 'Choisis au moins un billet.')
      .max(10),
    accept_terms: z.literal(true, { error: 'Tu dois accepter les CGV et la politique de remboursement.' }),
    guardian_consent: z.literal(true, {
      error: 'Tu dois confirmer être le représentant légal du participant mineur ou avoir son autorisation parentale.',
    }),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    v.items.forEach((it, i) => {
      if (ids.has(it.tier_id)) ctx.addIssue({ code: 'custom', message: 'Tarif en double.', path: ['items', i] });
      ids.add(it.tier_id);
      if (it.participants.length !== it.quantity) {
        ctx.addIssue({ code: 'custom', message: 'Indique le nom de chaque participant.', path: ['items', i, 'participants'] });
      }
    });
    if (v.items.reduce((n, it) => n + it.quantity, 0) > 20) {
      ctx.addIssue({ code: 'custom', message: '20 billets maximum par commande.', path: ['items'] });
    }
  });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const cancelCheckoutSchema = z.object({
  order_number: z.string().regex(/^SUN-\d{4,10}$/, 'Commande invalide.'),
});

// ---------------------------------------------------------------------
// Administration des commandes, remboursements, invitations, scan
// ---------------------------------------------------------------------
export const ORDER_STATUSES = ['pending', 'paid', 'expired', 'cancelled', 'partially_refunded', 'refunded'] as const;

export const orderListSchema = z.object({
  event: slugSchema.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  // recherche libre : uniquement des caractères sûrs (pas de syntaxe de filtre PostgREST)
  q: z.string().trim().max(80).regex(/^[\p{L}\p{N}@.\s'_-]*$/u, 'Recherche invalide.').optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

export const refundSchema = z.object({
  request_id: z.uuid('Requête invalide.'),                          // clé d'idempotence (double clic)
  amount_cents: z.number().int().min(1, 'Montant invalide.').max(1000000).optional(),   // absent = tout le reste
  reason: z.string().trim().max(200, 'Motif trop long.').default(''),
  cancel_ticket_ids: z.array(z.uuid()).max(20).default([]),
});

export const invitationSchema = z.object({
  slug: slugSchema,
  tier_id: z.uuid('Tarif invalide.'),
  guests: z
    .array(
      z.object({
        email: z.string().trim().toLowerCase().pipe(z.email('Email invalide.')),
        first_name: z.string().trim().min(1, 'Prénom requis.').max(60),
        last_name: z.string().trim().min(1, 'Nom requis.').max(60),
        quantity: z.number().int().min(1).max(20).default(1),
      }),
    )
    .min(1, 'Ajoute au moins un invité.')
    .max(50, '50 invités maximum par envoi.'),
});

export const scanSchema = z.object({
  code: z.string().trim().min(1, 'Code manquant.').max(100),
  event_id: z.uuid('Événement invalide.'),
});
