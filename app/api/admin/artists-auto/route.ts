import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readStore, type StoredArtist } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { buildArtist } from '@/lib/adminRecords';
import { artistMatchKey, buildArtistIndex, isUsableName } from '@/lib/artistLinks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/artists-auto — appelé à l'ENREGISTREMENT d'un programme, après
 * confirmation dans l'admin (jamais depuis une page publique).
 *   { creates: string[], aliases: { slug, alias }[] }
 *  - creates : profils minimaux (autoCreated, sans photo ni bio). Un nom qui existe
 *    déjà (nom, slug ou alias) n'est pas recréé : le profil existant est renvoyé.
 *  - aliases : « Lier à WIIXX » = mémoriser la graphie saisie comme alias de la fiche.
 * Tout est écrit en UNE seule persistance (un seul commit en production).
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  let body: { creates?: unknown; aliases?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }
  const names = (Array.isArray(body.creates) ? body.creates : [])
    .filter((n): n is string => typeof n === 'string')
    .map((n) => n.trim())
    .filter(isUsableName);
  const aliasReqs = (Array.isArray(body.aliases) ? body.aliases : []).filter(
    (a): a is { slug: string; alias: string } =>
      !!a && typeof (a as { slug?: unknown }).slug === 'string' && typeof (a as { alias?: unknown }).alias === 'string',
  );
  if (names.length === 0 && aliasReqs.length === 0) return NextResponse.json({ ok: true, items: [] });

  const store = await readStore();
  const changed = new Map<string, StoredArtist>();

  for (const { slug, alias } of aliasReqs) {
    const target = store.artists.find((a) => a.slug === slug);
    const a = alias.trim();
    if (!target || !isUsableName(a)) continue;
    const owner = buildArtistIndex(store.artists).get(artistMatchKey(a));
    if (owner) continue; // déjà résolu (par ce profil ou un autre) : on ne détourne rien
    target.aliases = [...(target.aliases ?? []), a];
    changed.set(target.id, target);
  }

  for (const name of names) {
    if (buildArtistIndex(store.artists).has(artistMatchKey(name))) continue; // pas de doublon
    const built = buildArtist({ name, autoCreated: true }, store);
    if ('error' in built) continue;
    store.artists.unshift(built);
    changed.set(built.id, built);
  }

  if (changed.size === 0) return NextResponse.json({ ok: true, items: [] });
  const saved = await persistStore(store);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 502 });
  return NextResponse.json({ ok: true, items: [...changed.values()], deployed: saved.deployed });
}
