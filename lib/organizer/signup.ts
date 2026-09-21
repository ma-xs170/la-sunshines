// Inscription d'une organisation en plusieurs pages : règles PURES (testées), partagées par le formulaire (navigateur) et la route serveur.
// Les droits et les limites sont revérifiés en SQL (org_register).
import { z } from 'zod';

export const LEGAL_FORMS = [['association', 'Association (loi 1901)'], ['sas', 'SAS / SASU'], ['sarl', 'SARL / EURL'], ['micro', 'Auto-entrepreneur / micro-entreprise'], ['autre', 'Autre']] as const;
export const LEGAL_FORM_LABEL: Record<string, string> = Object.fromEntries(LEGAL_FORMS);
export const REGIONS_ORG = [['guadeloupe', 'Guadeloupe'], ['martinique', 'Martinique'], ['sxm', 'Saint-Martin / Saint-Barthélemy'], ['france', 'France hexagonale']] as const;
export const DOC_KINDS = [['identity', 'Pièce d’identité du responsable'], ['legal', 'Justificatif de la structure (Kbis, avis SIRENE ou récépissé de préfecture)'], ['other', 'Autre pièce (facultatif)']] as const;
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const docOk = (type: string, size: number) => DOC_TYPES.includes(type) && size > 0 && size <= DOC_MAX_BYTES;

/** Clé de Luhn du SIRET (les SIRET de La Poste, préfixe 356000000, suivent une autre règle : acceptés si la somme des chiffres est multiple de 5). */
export function siretValid(raw: string): boolean {
  const s = raw.replace(/\s/g, '');
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith('356000000')) return [...s].reduce((n, c) => n + Number(c), 0) % 5 === 0;
  let sum = 0;
  for (let i = 0; i < 14; i++) { let d = Number(s[13 - i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
}

const txt = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, `${max} caractères au maximum.`);
const email = z.string().trim().min(1, 'L’adresse e-mail est obligatoire.').max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Adresse e-mail invalide.');

export const stepSchemas = {
  structure: z.object({
    name: txt(1, 120, 'Le nom de la structure est obligatoire.'),
    legal_form: z.enum(['association', 'sas', 'sarl', 'micro', 'autre'], { message: 'Choisis la forme juridique.' }),
    siret: z.string().trim().refine((v) => v === '' || siretValid(v), 'SIRET invalide : 14 chiffres, clé de contrôle incorrecte.').transform((v) => v.replace(/\s/g, '')),
    address: txt(3, 200, 'L’adresse est obligatoire.'),
    postal_code: z.string().trim().regex(/^\d{5}$/, 'Code postal : 5 chiffres.'),
    city: txt(1, 80, 'La ville est obligatoire.'),
  }),
  contact: z.object({
    responsible_first: txt(1, 60, 'Le prénom est obligatoire.'),
    responsible_last: txt(1, 60, 'Le nom est obligatoire.'),
    contact_email: email,
    phone: z.string().trim().regex(/^[+0-9 .()-]{6,20}$/, 'Numéro de téléphone invalide.'),
    website: z.string().trim().max(200).refine((v) => v === '' || /^https:\/\/[^\s]+$/.test(v), 'Le site doit commencer par https://.'),
  }),
  activity: z.object({
    description: txt(20, 1500, 'Décris ton activité en 20 caractères minimum.'),
    regions: z.array(z.enum(['guadeloupe', 'martinique', 'sxm', 'france'])).min(1, 'Choisis au moins une région.'),
    events_per_year: z.enum(['1-3', '4-10', '10+'], { message: 'Choisis une fourchette.' }),
    accept_terms: z.literal(true, { message: 'Tu dois accepter les conditions.' }),
  }),
};
export const fullSchema = stepSchemas.structure.and(stepSchemas.contact).and(stepSchemas.activity);
export type SignupData = z.input<typeof stepSchemas.structure> & z.input<typeof stepSchemas.contact> & z.input<typeof stepSchemas.activity>;

export const docSchema = z.object({
  kind: z.enum(['identity', 'legal', 'other']),
  path: z.string().regex(/^orgdocs\/[A-Za-z0-9._-]{1,120}$/).refine((p) => !p.includes('..')),
  name: z.string().min(1).max(120), size: z.number().int().positive().max(DOC_MAX_BYTES),
  mime: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
});
export const submitSchema = z.object({
  data: fullSchema,
  docs: z.array(docSchema).max(6).refine((d) => d.some((x) => x.kind === 'identity'), 'La pièce d’identité est obligatoire.').refine((d) => d.some((x) => x.kind === 'legal'), 'Le justificatif de la structure est obligatoire.'),
});

/** Erreurs d'une étape : { champ: message } (première erreur de chaque champ). */
export function stepErrors(step: keyof typeof stepSchemas, value: unknown): Record<string, string> {
  const r = stepSchemas[step].safeParse(value);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) { const k = String(i.path[0] ?? ''); if (!out[k]) out[k] = i.message; }
  return out;
}
