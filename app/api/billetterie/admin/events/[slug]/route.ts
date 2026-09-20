import { NextResponse } from 'next/server';
import { fail, parseBody } from '@/lib/auth/http';
import { eventSaveSchema } from '@/lib/ticketing/schemas';
import { adminGetEvent, adminSaveEvent } from '@/lib/ticketing/admin';
import { editionForSlug, requireBilletterieAdmin, revalidateTicketing } from '@/lib/ticketing/guard';
import { getTicketingSettings } from '@/lib/ticketing/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

// GET : configuration billetterie + tarifs (vendus / réservés) d'un événement.
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { slug } = await params;
  const edition = editionForSlug(slug);
  if (!edition) return fail('Événement introuvable.', 404);

  const view = await adminGetEvent(slug);
  const s = await getTicketingSettings(true);
  return NextResponse.json({
    // mode RÉEL (base, partagé avec la production) et mode effectif ici (forcé en local / Preview par TICKETING_FORCE_MODE)
    settings: { mode: s.mode, dbMode: s.dbMode, forced: s.forced },
    edition: { slug, name: edition.name, dateISO: edition.dateISO ?? null, timeLabel: edition.timeLabel ?? null, venue: edition.venue ?? '' },
    ...view,
  });
}

// PUT : crée ou met à jour la configuration billetterie de l'événement.
export async function PUT(req: Request, { params }: Ctx) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { slug } = await params;
  if (!editionForSlug(slug)) return fail('Événement introuvable.', 404);

  const parsed = await parseBody(req, eventSaveSchema);
  if ('res' in parsed) return parsed.res;

  const r = await adminSaveEvent(guard.actor, slug, parsed.data);
  if (!r.ok) return fail(r.error.message, r.error.status);
  revalidateTicketing();
  return NextResponse.json({ ok: true, id: r.data });
}
