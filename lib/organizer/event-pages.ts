// Validation des pages évènement (Phase 2) : PURE, partagée par les routes API et testée. Le SQL revérifie les bornes.
import { z } from 'zod';
import { normalizeDresscode, type DresscodeValue } from '@/lib/dresscodeColors';
import { NETWORKS, normalizeSocial, type Network } from '@/lib/socialLinks';

export const REGIONS = ['france', 'martinique', 'guadeloupe', 'sxm'] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABEL: Record<Region, string> = { france: 'France', martinique: 'Martinique', guadeloupe: 'Guadeloupe', sxm: 'SXM' };

const text = (max: number) => z.string().max(max).transform((v) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim());

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  label: text(140).pipe(z.string().min(1, 'Chaque question a besoin d’un intitulé.')),
  type: z.enum(['text', 'choice', 'checkbox']),
  required: z.boolean(),
  options: z.array(text(80).pipe(z.string().min(1))).max(10).default([]),
}).refine((q) => q.type !== 'choice' || q.options.length >= 2, { message: 'Une question à choix a besoin d’au moins deux options.' });
export const consentSchema = z.object({ key: z.string().regex(/^[a-z0-9_-]{1,40}$/), label: text(300).pipe(z.string().min(1)), required: z.boolean() });

export const detailsSchema = z.object({
  event_type: text(60), subtitle: text(140), description: text(6000),
  visibility: z.enum(['public', 'private']),
  publish_mode: z.enum(['now', 'later']),
  publish_at: z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Date de publication invalide.').nullable(),
  dresscode: z.unknown(),
  contact_email: text(254).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Adresse e-mail de contact invalide.'),
  contact_phone: text(30).refine((v) => v === '' || /^[+0-9 ().-]{6,30}$/.test(v), 'Numéro de téléphone invalide.'),
  socials: z.record(z.string(), z.string().max(300)),
  form_questions: z.array(questionSchema).max(20),
  guardian_form: z.boolean(),
  terms: text(12000),
  consents: z.array(consentSchema).max(10),
}).partial().strict();

export type DetailsPatch = Record<string, unknown>;

/** Nettoie un patch de détails : renvoie { patch } prêt pour org_event_details_save, ou { error } (message humain, champ par champ). */
export function buildDetailsPatch(input: unknown): { patch: DetailsPatch } | { error: string } {
  const r = detailsSchema.safeParse(input);
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Requête invalide.' };
  const d = r.data;
  const patch: DetailsPatch = { ...d };
  if ('dresscode' in d) patch.dresscode = normalizeDresscode(d.dresscode) satisfies DresscodeValue;
  if (d.socials) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.socials)) {
      const net = NETWORKS.find((n) => n.id === k);
      if (!net) return { error: `Réseau inconnu : ${k}.` };
      const url = normalizeSocial(net.id as Network, v);
      if (url === null) return { error: `Lien ${net.label} invalide : saisis un pseudo, un @pseudo ou l’adresse complète de ta page ${net.label}.` };
      if (url) out[k] = url;
    }
    patch.socials = out;
  }
  if (d.publish_mode === 'now') patch.publish_at = null;
  else if (d.publish_mode === 'later' && !d.publish_at) return { error: 'Choisis la date et l’heure de publication.' };
  if ('publish_at' in patch && patch.publish_at) patch.publish_at = new Date(patch.publish_at as string).toISOString();
  return { patch };
}

export const venueSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  org: z.string().uuid(),
  name: text(120).pipe(z.string().min(1, 'Le nom du lieu est obligatoire.')),
  address: text(250), postal_code: text(12), city: text(80), country: text(60),
  region: z.enum(REGIONS, { message: 'Choisis la région : France, Martinique, Guadeloupe ou SXM.' }),
  lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(),
  hide_address: z.boolean(),
});

export const sessionSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  venue_id: z.string().uuid().nullable(),
  label: text(80),
  starts_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Date de début invalide.'),
  ends_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Date de fin invalide.').nullable(),
  capacity: z.number().int().min(1).max(100000).nullable(),
  confirm: z.boolean().optional(),
}).refine((s) => !s.ends_at || Date.parse(s.ends_at) > Date.parse(s.starts_at), { message: 'La fin doit être après le début.', path: ['ends_at'] });

/** Lien Google Maps généré depuis les coordonnées (ou, à défaut, l'adresse). */
export function mapsLink(v: { lat?: number | null; lng?: number | null; name?: string; address?: string; city?: string }): string | null {
  if (v.lat != null && v.lng != null) return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  const q = [v.name, v.address, v.city].filter(Boolean).join(' ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
