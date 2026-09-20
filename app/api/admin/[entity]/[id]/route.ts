import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import {
  applyArtistPatch,
  applyEventPatch,
  applyAnnouncementPatch,
} from '@/lib/adminRecords';
import { notifySubscribersForEvent } from '@/lib/subscriptions';
import { deleteSupportTicket, setSupportTicketStatus } from '@/lib/supportTickets';
import { setArtistEmail } from '@/lib/privateData';

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

  // Demandes de support : Supabase uniquement (jamais content.json, dépôt public).
  if (entity === 'tickets') {
    const item = await setSupportTicketStatus(id, body.status === 'done' ? 'done' : 'open');
    if (!item) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  }

  const store = await readStore();

  if (entity === 'artists') {
    const idx = store.artists.findIndex((a) => a.id === id);
    if (idx < 0) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
    store.artists[idx] = applyArtistPatch(store.artists[idx], body);
    // l'email est PRIVÉ (Supabase) ; on ne le met à jour que s'il est fourni, et jamais dans le fichier de contenu
    if (body.email !== undefined && !(await setArtistEmail(store.artists[idx].slug, String(body.email)))) {
      return NextResponse.json({ error: 'Stockage privé (Supabase) indisponible : email non enregistré.' }, { status: 503 });
    }
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

  const idx = store.events.findIndex((e) => e.id === id);
  if (idx < 0) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  store.events[idx] = applyEventPatch(store.events[idx], body);
  await notifySubscribersForEvent(store, store.events[idx]); // 1x par (event, abonné)
  const saved = await persistStore(store);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
  return NextResponse.json({ ok: true, item: store.events[idx], deployed: saved.deployed });
}

// DELETE /api/admin/events/:id  — suppression
export async function DELETE(_req: Request, { params }: Ctx) {
  const { entity, id } = await params;
  const bad = await guard(entity);
  if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status });

  if (entity === 'tickets') {
    if (!(await deleteSupportTicket(id))) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const store = await readStore();
  const list =
    entity === 'artists'
      ? store.artists
      : entity === 'announcements'
        ? store.announcements
        : store.events;
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length)
    return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });

  if (entity === 'artists') store.artists = next as typeof store.artists;
  else if (entity === 'announcements')
    store.announcements = next as typeof store.announcements;
  else store.events = next as typeof store.events;
  const saved = await persistStore(store);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
  return NextResponse.json({ ok: true, deployed: saved.deployed });
}
