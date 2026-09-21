// Création d'évènement en 3 étapes : règles PURES (testées), partagées par le formulaire et la route serveur. Droits et refus revérifiés en SQL (org_create_event).
import { z } from 'zod';
import { REGIONS } from '@/lib/calendar';
import { parseBizoukCode } from '@/lib/bizoukEmbed';

export const EVENT_TYPES = ['Soirée', 'Concert', 'Festival', 'Afterwork', 'Brunch / Day party', 'Soirée à thème', 'Autre'] as const;
export const MODES = ['internal', 'bizouk', 'none'] as const;
export type TicketingMode = (typeof MODES)[number];
export const MODE_LABEL: Record<TicketingMode, string> = { internal: 'Vente sur le site', bizouk: 'Code d’intégration Bizouk', none: 'Pas de billetterie pour l’instant' };

export const slugify = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'evenement';

/** Date + heure LOCALES du lieu → ISO avec le bon décalage (Antilles : UTC−4 toute l'année ; France : heure de Paris, été/hiver). */
export function zonedIso(date: string, time: string, region: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  if (region !== 'france') { const d = new Date(`${date}T${time}:00-04:00`); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  for (const off of ['+02:00', '+01:00']) {
    const d = new Date(`${date}T${time}:00${off}`); if (Number.isNaN(d.getTime())) return null;
    const back = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace(' ', 'T');
    if (back.startsWith(`${date}T${time}`)) return d.toISOString();
  }
  return null;
}

const t = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, `${max} caractères au maximum.`);
export const infoSchema = z.object({
  title: t(3, 120, 'Le titre doit faire au moins 3 caractères.'),
  event_type: z.enum(EVENT_TYPES, { message: 'Choisis le type d’évènement.' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choisis la date.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Choisis l’heure.'),
  venue_name: t(1, 120, 'Le lieu est obligatoire.'),
  city: t(1, 80, 'La ville est obligatoire.'),
  region: z.enum(REGIONS, { message: 'Choisis la région.' }),
  visibility: z.enum(['public', 'private'], { message: 'Choisis la visibilité.' }),
}).superRefine((v, ctx) => {
  const iso = zonedIso(v.date, v.time, v.region);
  if (!iso) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Date ou heure invalide.' });
  else if (Date.parse(iso) < Date.now() - 86_400_000) ctx.addIssue({ code: 'custom', path: ['date'], message: 'La date ne peut pas être passée.' });
});
export const createSchema = z.object({
  org: z.string().uuid('Choisis une organisation.'),
  mode: z.enum(MODES, { message: 'Choisis une méthode de billetterie.' }),
  bizouk_code: z.string().max(4000).optional(),
}).and(infoSchema).superRefine((v, ctx) => {
  if (v.mode === 'bizouk') { const p = parseBizoukCode(v.bizouk_code); if (!p.ok) ctx.addIssue({ code: 'custom', path: ['bizouk_code'], message: p.message }); }
});
export type CreateInput = z.input<typeof createSchema>;

export function infoErrors(value: unknown): Record<string, string> {
  const r = infoSchema.safeParse(value); if (r.success) return {};
  const out: Record<string, string> = {}; for (const i of r.error.issues) { const k = String(i.path[0] ?? ''); if (!out[k]) out[k] = i.message; } return out;
}

export interface OrgCard { id: string; name: string; reference: string | null; siret: string | null; status: 'pending' | 'approved' | 'suspended'; events: number }
export const ORG_STATUS_LABEL: Record<OrgCard['status'], string> = { approved: 'Approuvée', pending: 'En vérification', suspended: 'Suspendue' };
export const ORG_BLOCK_NOTE: Record<'pending' | 'suspended', string> = {
  pending: 'En vérification : l’équipe examine ce dossier. Tu pourras créer des évènements dès l’approbation.',
  suspended: 'Suspendue : la création d’évènements est bloquée. Contacte l’équipe.',
};
export const selectable = (o: Pick<OrgCard, 'status'>) => o.status === 'approved';

/** Étapes suivantes affichées sur le tableau de bord d'un brouillon. */
export interface StepInput { hasDescription: boolean; hasDresscode: boolean; hasFlyer: boolean; hasTiers: boolean; mode: TicketingMode; hasBizouk: boolean; published: boolean }
export function nextSteps(i: StepInput, base: string): { key: string; label: string; done: boolean; href: string }[] {
  return [
    { key: 'description', label: 'Rédiger la description', done: i.hasDescription, href: `${base}/description` },
    { key: 'dresscode', label: 'Choisir le dresscode', done: i.hasDresscode, href: `${base}/description` },
    { key: 'flyer', label: 'Ajouter le flyer', done: i.hasFlyer, href: `${base}/flyer` },
    i.mode === 'bizouk' ? { key: 'tickets', label: 'Vérifier le widget Bizouk', done: i.hasBizouk, href: `${base}/billetterie` }
      : i.mode === 'none' ? { key: 'tickets', label: 'Choisir une méthode de billetterie (facultatif)', done: false, href: `${base}/billetterie` }
      : { key: 'tickets', label: 'Créer les tarifs', done: i.hasTiers, href: `${base}?onglet=tarifs` },
    { key: 'publish', label: 'Demander la publication (validation par l’équipe)', done: i.published, href: '#pub-h' },
  ];
}
