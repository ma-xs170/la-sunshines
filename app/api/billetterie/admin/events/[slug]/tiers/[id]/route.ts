import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail } from '@/lib/auth/http';
import { adminRemoveTier } from '@/lib/ticketing/admin';
import { requireBilletterieAdmin, revalidateTicketing } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE : supprime un tarif jamais vendu ; sinon l'ARCHIVE (réponse « archived »).
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail('Identifiant de tarif invalide.');

  const r = await adminRemoveTier(guard.actor, id);
  if (!r.ok) return fail(r.error.message, r.error.status);
  revalidateTicketing();
  return NextResponse.json({ ok: true, result: r.data });
}
