import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { NETWORKS, normalizeSocial, type Network } from '@/lib/socialLinks';
import { revalidatePublicSite } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const BLOB = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//;
const schema = z.object({ org: z.string().uuid(), description: z.string().max(3000).optional(), website: z.string().trim().max(200).optional(), socials: z.record(z.string(), z.string().max(300)).optional(),
  logo_url: z.string().regex(BLOB).nullable().optional(), banner_url: z.string().regex(BLOB).nullable().optional() });

// PUT — édite la page publique (owner / manager / admin, revérifié en SQL). POST — jeton d'envoi direct d'une image (logo ou bannière) : JPEG / PNG / WebP, 5 Mo.
export async function PUT(req: Request) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const { org, socials, website, ...rest } = p.data; const patch: Record<string, unknown> = { ...rest };
  if (website !== undefined) { if (website && !/^https:\/\/[^\s]+\.[^\s]+$/.test(website)) return Response.json({ error: 'Le site web doit commencer par https://.' }, { status: 400 }); patch.website = website; }
  if (socials) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(socials)) {
      const n = NETWORKS.find((x) => x.id === k); if (!n) return Response.json({ error: `Réseau inconnu : ${k}.` }, { status: 400 });
      const u = normalizeSocial(n.id as Network, v); if (u === null) return Response.json({ error: `Lien ${n.label} invalide : saisis un pseudo, un @pseudo ou l’adresse complète.` }, { status: 400 }); if (u) out[k] = u;
    }
    patch.socials = out;
  }
  const r = await orgRpc('org_page_save', { p_actor: g.s.userId, p_org: org, p_patch: patch });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  revalidatePublicSite();
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || typeof body !== 'object' || !('type' in body)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const orgs = await orgRpc<{ id: string; my_role: string }[]>('org_list', { p_actor: g.s.userId });
  const allowed = orgs.ok ? orgs.data.filter((o) => o.my_role !== 'staff').map((o) => o.id) : [];
  try {
    return Response.json(await handleUpload({ request: req, body, onBeforeGenerateToken: async (pathname) => {
      if (!allowed.some((id) => pathname.startsWith(`organisateurs/${id}/`))) throw new Error('Chemin refusé.');
      return { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'], maximumSizeInBytes: 5 * 1024 * 1024, addRandomSuffix: true };
    }, onUploadCompleted: async () => {} }));
  } catch { return Response.json({ error: 'Envoi refusé.' }, { status: 400 }); }
}
