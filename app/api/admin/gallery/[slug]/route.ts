import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readStore, writeStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

const MAX_PER_EDITION = 30;

async function load(
  ctx: Ctx,
): Promise<{ slug: string; err: null } | { slug: null; err: NextResponse }> {
  if (!(await isAuthed()))
    return {
      slug: null,
      err: NextResponse.json({ error: 'Non autorisé.' }, { status: 401 }),
    };
  const { slug } = await ctx.params;
  if (!slug)
    return {
      slug: null,
      err: NextResponse.json({ error: 'Slug manquant.' }, { status: 400 }),
    };
  return { slug, err: null };
}

// PATCH /api/admin/gallery/:slug  — body { images: string[] } — ajoute des photos
export async function PATCH(req: Request, ctx: Ctx) {
  const { slug, err } = await load(ctx);
  if (err) return err;

  let body: { images?: unknown };
  try {
    body = (await req.json()) as { images?: unknown };
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }
  const incoming = Array.isArray(body.images)
    ? body.images.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'Aucune image reçue.' }, { status: 400 });
  }

  const store = await readStore();
  const current = store.galleries[slug] ?? [];
  const next = [...current, ...incoming].slice(0, MAX_PER_EDITION);
  store.galleries[slug] = next;
  await writeStore(store);
  return NextResponse.json({ ok: true, gallery: next });
}

// DELETE /api/admin/gallery/:slug  — body { index: number } — retire une photo
export async function DELETE(req: Request, ctx: Ctx) {
  const { slug, err } = await load(ctx);
  if (err) return err;

  let body: { index?: unknown };
  try {
    body = (await req.json()) as { index?: unknown };
  } catch {
    body = {};
  }
  const index = typeof body.index === 'number' ? body.index : -1;

  const store = await readStore();
  const current = store.galleries[slug] ?? [];
  if (index < 0 || index >= current.length) {
    return NextResponse.json({ error: 'Index hors limites.' }, { status: 400 });
  }
  const next = current.filter((_, i) => i !== index);
  if (next.length) store.galleries[slug] = next;
  else delete store.galleries[slug];
  await writeStore(store);
  return NextResponse.json({ ok: true, gallery: next });
}
