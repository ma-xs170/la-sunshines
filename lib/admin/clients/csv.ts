// Export CSV des clients (PUR, testé) : UTF-8 avec BOM, séparateur « ; » (Excel français), protection contre l'injection de formules.
export const BOM = '﻿';

/** Une cellule qui commence par = + - @ (ou tabulation / retour chariot) serait interprétée comme une formule : on la préfixe d'une apostrophe. */
export function safeCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const CSV_HEADER = ['Référence', 'Prénom', 'Nom', 'E-mail', 'Téléphone', 'Téléphone 2', 'Date de naissance', 'Rôle', 'Statut', 'Inscrit le'];
const ROLE: Record<string, string> = { customer: 'Client', staff: 'Équipe scan', admin: 'Admin' };
const STATUS: Record<string, string> = { active: 'Actif', suspended: 'Suspendu', anonymized: 'Anonymisé' };

export interface ExportRow { reference: string; first_name: string; last_name: string; email: string; phone: string; phone2: string; birth_date: string | null; role: string; status: string; created_at: string }

export function customersCsv(rows: ExportRow[]): string {
  const lines = [CSV_HEADER.map(safeCell).join(';')];
  for (const r of rows) lines.push([r.reference, r.first_name, (r.last_name ?? '').toLocaleUpperCase('fr-FR'), r.email, r.phone, r.phone2, r.birth_date ?? '', ROLE[r.role] ?? r.role, STATUS[r.status] ?? r.status, (r.created_at ?? '').slice(0, 10)].map(safeCell).join(';'));
  return BOM + lines.join('\r\n') + '\r\n';
}
