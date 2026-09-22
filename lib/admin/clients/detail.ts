// Fiche client : types (miroir exact du JSON renvoyé par admin_customer_detail, migration 027) + validation du formulaire d'édition.
// PUR et testé (la validation), pour que la page et les tests partagent les mêmes règles que la base.
import { normalizePhone } from './phone';
import { AGE_MAX, AGE_MIN, ageFrom, ageOutOfRange } from './format';

export type AccountStatus = 'active' | 'suspended' | 'anonymized';
export type AccountRole = 'customer' | 'staff' | 'admin';

export interface ClientProfile {
  id: string; reference: string; first_name: string; last_name: string; email: string; phone: string; phone2: string;
  birth_date: string | null; age: number | null; is_minor: boolean; role: AccountRole; status: AccountStatus; status_reason: string;
  created_at: string; updated_at: string; last_sign_in_at: string | null; anonymized_at: string | null;
}
export interface ClientOrganization { id: string; name: string; reference: string | null; role: string }
export interface ClientOrderItem { tier_name: string; quantity: number; unit_price_cents: number }
export interface ClientTicket { reference: string; status: string; tier_name: string; holder: string }
export interface ClientConsent { key: string; label: string; accepted: boolean; at: string }
export interface ClientOrder {
  id: string; order_number: string; status: string; source: 'web' | 'manual'; event_slug: string; event_title: string; starts_at: string;
  total_cents: number; refunded_cents: number; paid_at: string | null; created_at: string; guardian_consent_at: string | null; terms_accepted_at: string | null; terms_version: string | null;
  items: ClientOrderItem[]; tickets: ClientTicket[]; consents: ClientConsent[];
}
export interface ClientHistoryEntry {
  id: number; created_at: string; action: string; actor_id: string | null; actor_name: string | null; reason: string | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null; meta: Record<string, unknown>;
}
export interface ClientDetail {
  profile: ClientProfile; access: { super: boolean; modifier: boolean }; organizations: ClientOrganization[]; orders: ClientOrder[]; history: ClientHistoryEntry[];
}

export interface EditForm { first_name: string; last_name: string; phone: string; phone2: string; email: string; birth_date: string; reason: string }
export type EditPayload = { first_name: string; last_name: string; phone: string; phone2: string; email: string; birth_date: string | null; reason: string };
export type EditResult = { ok: true; value: EditPayload; ageWarning: boolean } | { ok: false; errors: Partial<Record<keyof EditForm, string>> };

const isFutureOrTooOld = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); const today = new Date(); today.setUTCHours(0, 0, 0, 0); return Number.isNaN(d.getTime()) || d > today || d < new Date('1900-01-01'); };

/** Valide le formulaire d'édition (mêmes règles que la fonction SQL) et dit si l'âge sort de 12–100 ans (alerte, jamais bloquant). */
export function validateEditForm(f: EditForm, current: { email: string; birth_date: string | null }): EditResult {
  const errors: Partial<Record<keyof EditForm, string>> = {};
  const first = f.first_name.trim(), last = f.last_name.trim();
  if (!first || first.length > 60) errors.first_name = 'Prénom obligatoire (60 caractères maximum).';
  if (!last || last.length > 60) errors.last_name = 'Nom obligatoire (60 caractères maximum).';
  const p1 = normalizePhone(f.phone); if (!p1.ok) errors.phone = p1.error;
  const p2 = normalizePhone(f.phone2); if (!p2.ok) errors.phone2 = p2.error;
  const email = f.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = 'Adresse e-mail invalide.';
  let birth: string | null = f.birth_date.trim() || null;
  if (birth && (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || isFutureOrTooOld(birth))) errors.birth_date = 'Date de naissance invalide (jamais dans le futur).';
  const emailChanged = errors.email === undefined && email !== current.email.toLowerCase();
  const birthChanged = errors.birth_date === undefined && birth !== (current.birth_date ?? null);
  if ((emailChanged || birthChanged) && f.reason.trim().length < 5) errors.reason = 'Motif obligatoire (5 caractères minimum) pour l’e-mail ou la date de naissance.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const age = birth ? ageFrom(birth) : null;
  return { ok: true, value: { first_name: first, last_name: last, phone: p1.ok ? p1.value : '', phone2: p2.ok ? p2.value : '', email, birth_date: birth, reason: f.reason.trim() }, ageWarning: ageOutOfRange(age) };
}
export { AGE_MIN, AGE_MAX };
