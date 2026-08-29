import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { buildArtist, buildEvent, buildAnnouncement } from '@/lib/adminRecords';
import { notifySubscribersForEvent } from '@/lib/subscriptions';

const ENTITIES = ['artists', 'events', 'announcements'] as const;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ entity: string }> };

// POST /api/admin/artists  |  /api/admin/events  — création
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  const { entity } = await params;
  if (!ENTITIES.includes(entity as (typeof ENTITIES)[number])) {
    return NextResponse.json({ error: 'Ressource inconnue.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  const store = await readStore();

  if (entity === 'artists') {
    const built = buildArtist(body as Record<string, unknown>, store);
    if ('error' in built) return NextResponse.json(built, { status: 400 });
    store.artists.unshift(built);
    const saved = await persistStore(store);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
    return NextResponse.json(
      { ok: true, item: built, deployed: saved.deployed },
      { status: 201 },
    );
  }

  if (entity === 'announcements') {
    const built = buildAnnouncement(body as Record<string, unknown>);
    if ('error' in built) return NextResponse.json(built, { status: 400 });
    // une seule annonce active à la fois
    if (built.active) store.announcements.forEach((a) => (a.active = false));
    store.announcements.unshift(built);
    const saved = await persistStore(store);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
    return NextResponse.json(
      { ok: true, item: built, deployed: saved.deployed },
      { status: 201 },
    );
  }

  const built = buildEvent(body as Record<string, unknown>, store);
  if ('error' in built) return NextResponse.json(built, { status: 400 });
  store.events.unshift(built);
  await notifySubscribersForEvent(store, built); // mute store.notifiedSubscribers
  const saved = await persistStore(store);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
  return NextResponse.json(
    { ok: true, item: built, deployed: saved.deployed },
    { status: 201 },
  );
}
