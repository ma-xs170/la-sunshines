import type { ReactNode } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { getAdminShellData } from '@/lib/admin/shell-data';
import '../organizer-shell.css';

// Cadre de l'espace admin (même design que l'espace organisateur). Sans compte admin Supabase (connexion par mot de passe historique,
// staff du scan, visiteur), les pages gardent leur affichage propre : aucune fonction ne dépend du cadre.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const d = await getAdminShellData().catch(() => null);
  if (!d) return <>{children}</>;
  return <AdminShell firstName={d.firstName} reference={d.reference} isSuper={d.isSuper} canClients={d.canClients} pending={d.pending} support={d.support} publications={d.publications}>{children}</AdminShell>;
}
