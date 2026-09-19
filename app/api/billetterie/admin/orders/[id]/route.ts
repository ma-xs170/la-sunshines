import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail } from '@/lib/auth/http';
import { getOrderDetail } from '@/lib/ticketing/admin-data';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail('Commande invalide.');
  const d = await getOrderDetail(id);
  return d ? NextResponse.json(d) : fail('Commande introuvable.', 404);
}
