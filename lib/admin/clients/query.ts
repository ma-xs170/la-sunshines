// Filtres de la liste des clients : tout est dans l'URL (?q=&role=&statut=&avenir=1&mineurs=1&tri=&sens=&page=). PUR (testé).
export const ROLES = { customers: 'Clients', organizers: 'Organisateurs', admins: 'Admins', all: 'Tous' } as const;
export type RoleFilter = keyof typeof ROLES;
export const STATUSES = { active: 'Actif', suspended: 'Suspendu', anonymized: 'Anonymisé' } as const;
export type Status = keyof typeof STATUSES;
export type SortKey = 'nom' | 'inscription' | 'age';
export const PAGE_SIZE = 20;

export interface ClientsQuery { q: string; role: RoleFilter; status: '' | Status; upcoming: boolean; minors: boolean; sort: SortKey; dir: 'asc' | 'desc'; page: number }
export const DEFAULT_QUERY: ClientsQuery = { q: '', role: 'customers', status: '', upcoming: false, minors: false, sort: 'inscription', dir: 'desc', page: 1 };

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;
const get = (sp: Raw, k: string): string => { const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ''; };

export function parseClientsQuery(sp: Raw): ClientsQuery {
  const role = get(sp, 'role'); const status = get(sp, 'statut'); const sort = get(sp, 'tri'); const dir = get(sp, 'sens'); const page = Number.parseInt(get(sp, 'page'), 10);
  const q = get(sp, 'q').replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    q: q.length >= 2 ? q : '',
    role: role in ROLES ? (role as RoleFilter) : 'customers',
    status: status in STATUSES ? (status as Status) : '',
    upcoming: get(sp, 'avenir') === '1', minors: get(sp, 'mineurs') === '1',
    sort: sort === 'nom' || sort === 'age' || sort === 'inscription' ? sort : 'inscription',
    dir: dir === 'asc' || dir === 'desc' ? dir : (sort === 'nom' ? 'asc' : 'desc'),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

/** Requête → paramètres d'URL (valeurs par défaut omises, pour des liens courts et partageables). */
export function clientsSearchParams(c: ClientsQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (c.q) p.set('q', c.q);
  if (c.role !== 'customers') p.set('role', c.role);
  if (c.status) p.set('statut', c.status);
  if (c.upcoming) p.set('avenir', '1');
  if (c.minors) p.set('mineurs', '1');
  if (c.sort !== 'inscription' || c.dir !== 'desc') { p.set('tri', c.sort); p.set('sens', c.dir); }
  if (c.page > 1) p.set('page', String(c.page));
  return p;
}
export const clientsHref = (c: ClientsQuery, base = '/admin/clients') => { const s = clientsSearchParams(c).toString(); return s ? `${base}?${s}` : base; };

/** Clic sur un en-tête : même colonne → sens inversé, sinon sens naturel (nom A→Z, inscription récente, âge croissant). Retour page 1. */
export function nextSort(c: ClientsQuery, key: SortKey): ClientsQuery {
  const dir = c.sort === key ? (c.dir === 'asc' ? 'desc' : 'asc') : key === 'inscription' ? 'desc' : 'asc';
  return { ...c, sort: key, dir, page: 1 };
}

/** Paramètres de la fonction SQL admin_list_customers. */
export const rpcArgs = (c: ClientsQuery) => ({ p_q: c.q || null, p_role: c.role, p_status: c.status || null, p_upcoming: c.upcoming, p_minors: c.minors, p_sort: c.sort, p_dir: c.dir, p_page: c.page, p_page_size: PAGE_SIZE });

export interface ClientRow {
  id: string; reference: string; first_name: string; last_name: string; email: string; phone: string; phone2: string; birth_date: string | null; age: number | null; is_minor: boolean;
  status: Status; role: 'customer' | 'staff' | 'admin'; created_at: string; upcoming: number; past: number;
}
export interface ClientsPage { total: number; page: number; page_size: number; rows: ClientRow[] }
