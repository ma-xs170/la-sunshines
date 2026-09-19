import { NextResponse } from 'next/server';
import { fail } from '@/lib/auth/http';
import { orderListSchema } from '@/lib/ticketing/schemas';
import { listOrders } from '@/lib/ticketing/admin-data';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';
import { firstIssue } from '@/lib/auth/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?event=&status=&q=&page= — liste des commandes (admin Supabase uniquement).
export async function GET(req: Request) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const sp = new URL(req.url).searchParams;
  const parsed = orderListSchema.safeParse({
    event: sp.get('event') || undefined,
    status: sp.get('status') || undefined,
    q: sp.get('q') || undefined,
    page: sp.get('page') || undefined,
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    return NextResponse.json(await listOrders(parsed.data));
  } catch (e) {
    console.error('[admin/orders]', e);
    return fail('Lecture impossible.', 500);
  }
}
