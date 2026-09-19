import { NextResponse } from 'next/server';
import { fail, parseBody } from '@/lib/auth/http';
import { tierSaveSchema } from '@/lib/ticketing/schemas';
import { adminSaveTier } from '@/lib/ticketing/admin';
import { editionForSlug, requireBilletterieAdmin, revalidateTicketing } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT : crée (sans id) ou met à jour (avec id) un tarif.
// Refusé si la quantité passe sous (vendus + réservations en cours).
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { slug } = await params;
  if (!editionForSlug(slug)) return fail('Événement introuvable.', 404);

  const parsed = await parseBody(req, tierSaveSchema);
  if ('res' in parsed) return parsed.res;

  const r = await adminSaveTier(guard.actor, slug, parsed.data);
  if (!r.ok) return fail(r.error.message, r.error.status);
  revalidateTicketing();
  return NextResponse.json({ ok: true, id: r.data });
}
