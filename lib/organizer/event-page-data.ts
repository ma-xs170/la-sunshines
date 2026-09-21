// Chargement commun des pages évènement (Phase 2) : session, accès (rôle revérifié en SQL), données.
import 'server-only';
import { forbidden, notFound, redirect } from 'next/navigation';
import { getOrgSession } from './access';
import { editorial, orgRpc } from './data';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { getAllEditions } from '@/lib/content';
import type { DetailsData } from '@/components/organizer/event/DescriptionForm';
import type { MediaRow } from '@/components/organizer/event/VideoUpload';
import type { SessionRow } from '@/components/organizer/event/SessionsPanel';
import type { Venue } from '@/components/organizer/event/VenuesPanel';

export interface EventPageData {
  event: { id: string; slug: string; status: string; starts_at: string; ticketing_enabled: boolean; sales_open_at: string | null; organizer_id: string };
  details: (DetailsData & { form_questions: unknown[]; guardian_form: boolean; terms: string; consents: unknown[] }) | null;
  sessions: SessionRow[]; venues: Venue[]; media: MediaRow[];
}

export async function loadEventPage(slug: string, next: string) {
  if (!SLUG_RE.test(slug)) notFound();
  const s = await getOrgSession();
  if (!s) redirect(`/connexion?next=${encodeURIComponent(next)}`);
  if (!s.hasAccess) forbidden();
  const r = await orgRpc<EventPageData>('org_event_details', { p_actor: s.userId, p_slug: slug });
  if (!r.ok) notFound();   // FORBIDDEN (autre organisation, staff) et introuvable : même réponse
  const ed = getAllEditions({ includeHidden: true }).find((e) => e.slug === slug);
  return { s, data: r.data, title: editorial(slug).title, flyer: editorial(slug).flyer, legacyDresscode: ed?.dresscode ?? '' };
}

export const emptyDetails = (): DetailsData => ({
  event_type: '', subtitle: '', description: '', visibility: 'public', publish_mode: 'now', publish_at: null,
  dresscode: { colors: [], free: false, note: '' }, contact_email: '', contact_phone: '', socials: {},
});
