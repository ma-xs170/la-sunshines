import { NextResponse } from 'next/server';
import { fail, parseBody } from '@/lib/auth/http';
import { settingSchema } from '@/lib/ticketing/schemas';
import { adminSetSetting } from '@/lib/ticketing/admin';
import { getTicketingSettings } from '@/lib/ticketing/settings';
import { requireBilletterieAdmin, revalidateTicketing } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  return NextResponse.json(await getTicketingSettings(true));
}

// PATCH { key, value } : bascule Bizouk ⇄ natif, frais de service, version des CGV.
export async function PATCH(req: Request) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;

  const parsed = await parseBody(req, settingSchema);
  if ('res' in parsed) return parsed.res;

  const r = await adminSetSetting(guard.actor, parsed.data);
  if (!r.ok) return fail(r.error.message, r.error.status);
  revalidateTicketing(); // effet immédiat sur les pages événement, sans redéploiement
  return NextResponse.json({ ok: true });
}
