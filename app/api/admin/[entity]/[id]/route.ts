import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import {
  applyArtistPatch,
  applyEventPatch,
  applyAnnouncementPatch,
} from '@/lib/adminRecords';

const ENTITIES = ['artists', 'events', 'announcements', 'tickets'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ entity: string; id: string }> };

async function guard(entity: string) {
  if (!(await isAuthed())) return { status: 401, error: 'Non autorisé.' };
  if (!ENTITIES.includes(entity))
    return { status: 404, error: 'Ressource inconnue.' };
  return null;
}

// PATCH /api/admin/events/:id  — modification
export async function PATCH(req: Request, { params }: Ctx) {
  const { entity, id } = await params;
  const bad = await guard(entity);
  if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  const store = await readStore();

  if (entity === 'artists') {
    const idx = store.artists.findIndex((a) => a.id === id);
    if (idx < 0) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
    store.artists[idx] = applyArtistPatch(store.artists[idx], body);
    const saved = await persistStore(store);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
    return NextResponse.json({ ok: true, item: store.artists[idx], deployed: saved.deployed });
  }

  if (entity === 'announcements') {
    const idx = store.announcements.findIndex((a) => a.id === id);
    if (idx < 0) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
    store.announcements[idx] = applyAnnouncementPatch(store.announcements[idx], body);
    // si on vient d'activer celle-ci, désactiver les autres
    if (store.announcements[idx].active) {
      store.announcements.forEach((a, i) => {
        if (i !== idx) a.active = false;
      });
    }
    const saved = await persistStore(store);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
    return NextResponse.json({ ok: true, item: store.announcements[idx], deployed: saved.deployed });
  }

  if (entity === 'tickets') {
    const idx = store.tickets.findIndex((t) => t.id === id);
    if (idx < 0) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
    const status = body.status === 'done' ? 'done' : 'open';
    store.tickets[idx] = { ...store.tickets[idx], status };
    const saved = await persistStore(store);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
    return NextResponse.json({ ok: true, item: store.tickets[idx], deployed: saved.deployed });
  }

  const idx = store.events.findIndex((e) => e.id === id);
  if (idx < 0) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  store.events[idx] = applyEventPatch(store.events[idx], body);
  const saved = await persistStore(store);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
  return NextResponse.json({ ok: true, item: store.events[idx], deployed: saved.deployed });
}

// DELETE /api/admin/events/:id  — suppression
export async function DELETE(_req: Request, { params }: Ctx) {
  const { entity, id } = await params;
  const bad = await guard(entity);
  if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status });

  const store = await readStore();
  const list =
    entity === 'artists'
      ? store.artists
      : entity === 'announcements'
        ? store.announcements
        : entity === 'tickets'
          ? store.tickets
          : store.events;
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length)
    return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });

  if (entity === 'artists') store.artists = next as typeof store.artists;
  else if (entity === 'announcements')
    store.announcements = next as typeof store.announcements;
  else if (entity === 'tickets') store.tickets = next as typeof store.tickets;
  else store.events = next as typeof store.events;
  const saved = await persistStore(store);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
  return NextResponse.json({ ok: true, deployed: saved.deployed });
}
