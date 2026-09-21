import { NextResponse } from 'next/server';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { createSchema, slugify, zonedIso } from '@/lib/organizer/create-event';
import { parseBizoukCode } from '@/lib/bizoukEmbed';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — crée un évènement en BROUILLON. Le rattachement à l'organisation est vérifié CÔTÉ SERVEUR (fonction SQL org_create_event) :
// membre gestionnaire de CETTE organisation (ou admin), organisation approuvée. Le code Bizouk collé est analysé ici : seul l'identifiant est conservé.
export async function POST(req: Request) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  if (!(await rateLimit(`event-create:${g.s.userId}:${clientIp(req)}`, 20, 3600)).ok) return NextResponse.json({ error: 'Trop de créations. Réessaie plus tard.' }, { status: 429 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) { const i = parsed.error.issues[0]; return NextResponse.json({ error: i?.message ?? 'Formulaire invalide.', field: String(i?.path?.[0] ?? '') }, { status: 400 }); }
  const v = parsed.data;
  const iso = zonedIso(v.date, v.time, v.region);
  const bz = v.mode === 'bizouk' ? parseBizoukCode(v.bizouk_code) : null;
  if (v.mode === 'bizouk' && !bz?.ok) return NextResponse.json({ error: bz && !bz.ok ? bz.message : 'Code Bizouk invalide.', field: 'bizouk_code' }, { status: 400 });
  const base = slugify(v.title);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const r = await orgRpc<{ id: string; slug: string }>('org_create_event', { p_actor: g.s.userId, p_org: v.org, p_data: {
      slug, title: v.title, event_type: v.event_type, ticketing_mode: v.mode, bizouk_event_id: bz && bz.ok ? bz.eventId : null, starts_at: iso, venue_name: v.venue_name, city: v.city, region: v.region, visibility: v.visibility } });
    if (r.ok) { return NextResponse.json({ slug: r.data.slug }); }
    if (r.error.message.includes('existe déjà')) continue;
    return NextResponse.json({ error: r.error.message }, { status: r.error.status });
  }
  return NextResponse.json({ error: 'Impossible de trouver une adresse libre pour cet évènement. Change légèrement le titre.' }, { status: 409 });
}
