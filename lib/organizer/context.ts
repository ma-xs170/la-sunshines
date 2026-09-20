// Contexte de l'espace organisateur pour une requête : session, organisations accessibles, organisation courante
// (choisie via le sélecteur, mémorisée dans un cookie et TOUJOURS revalidée parmi les organisations de l'acteur).
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getOrgSession } from './access';
import { orgRpc, type OrgAccountRow } from './data';

export const ORG_COOKIE = 'sun_org';

export const getOrgContext = cache(async () => {
  const s = await getOrgSession();
  if (!s || !s.hasAccess) return { s, orgs: [] as OrgAccountRow[], current: null as OrgAccountRow | null };
  const r = await orgRpc<OrgAccountRow[]>('org_list', { p_actor: s.userId });
  const orgs = r.ok ? r.data : [];
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
  return { s, orgs, current };
});
