import type { ReactNode } from 'react';
import { requireAdminPage } from '@/lib/adminSpace';

export const dynamic = 'force-dynamic';

// Le cadre (menu latéral, recherche) est fourni par app/admin/layout.tsx. Chaque page revérifie aussi l'accès : un layout n'est pas rejoué à chaque navigation.
export default async function GestionLayout({ children }: { children: ReactNode }) {
  await requireAdminPage('/admin');
  return <main className="org org-page">{children}</main>;
}
