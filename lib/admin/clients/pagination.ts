// Pagination de la liste des clients : fonction PURE (testée). Fenêtre de 5 pages autour de la page active (±2), toujours la 1re et la dernière,
// « … » dès qu'au moins une page est sautée.
export type PageItem = number | '…';

export function pageWindow(current: number, total: number, radius = 2): PageItem[] {
  const last = Math.max(0, Math.trunc(total) || 0);
  if (last < 1) return [];
  const size = radius * 2 + 1;
  const cur = Math.min(Math.max(1, Math.trunc(current) || 1), last);
  const start = Math.max(1, Math.min(cur - radius, last - size + 1));
  const end = Math.min(last, start + size - 1);
  const out: PageItem[] = [];
  if (start > 1) { out.push(1); if (start > 2) out.push('…'); }
  for (let i = start; i <= end; i++) out.push(i);
  if (end < last) { if (end < last - 1) out.push('…'); out.push(last); }
  return out;
}

export function pageCount(total: number, pageSize: number): number {
  return total > 0 ? Math.ceil(total / Math.max(1, pageSize)) : 0;
}

/** « 1–20 sur 1 342 clients » (espace insécable fine pour les milliers). */
export function rangeLabel(page: number, pageSize: number, total: number, noun = 'clients'): string {
  if (total <= 0) return `0 ${noun}`;
  const from = (page - 1) * pageSize + 1; const to = Math.min(total, page * pageSize);
  const n = (v: number) => v.toLocaleString('fr-FR').replace(/ /g, ' ');
  return `${n(from)}–${n(to)} sur ${n(total)} ${total > 1 ? noun : noun.replace(/s$/, '')}`;
}
