// Export CSV sûr. Une cellule qui commence par = + - @ (ou tabulation / retour chariot) serait
// interprétée comme une FORMULE par Excel / Sheets : on la neutralise (injection CSV).
// Les données viennent d'utilisateurs (noms, emails) : jamais de confiance.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(s)) s = "'" + s;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV UTF-8 avec BOM (accents corrects dans Excel), séparateur « ; » (Excel français). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvResponse(name: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
