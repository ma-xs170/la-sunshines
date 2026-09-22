import type { ReactNode } from 'react';
import { requireClientsPage } from '@/lib/admin/clients/access';
import './clients.css';

export const dynamic = 'force-dynamic';

// Le cadre (menu latéral, recherche) vient de app/admin/layout.tsx. Un layout n'est pas rejoué à chaque navigation : chaque page revérifie aussi l'accès.
export default async function ClientsLayout({ children }: { children: ReactNode }) {
  await requireClientsPage();
  return <main className="org org-page clients">{children}</main>;
}
