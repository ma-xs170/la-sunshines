import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import OrgSettingsForm from '@/components/organizer/OrgSettingsForm';
import { getOrgContext } from '@/lib/organizer/context';
import { can } from '@/lib/organizer/roles';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Paramètres · Espace organisateur', robots: { index: false, follow: false } };

// Paramètres légaux : propriétaire (ou admin) uniquement. Un gestionnaire ou un staff est renvoyé à l'accueil.
export default async function Settings() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/parametres');
  if (!s.hasAccess || !current || !can(current.my_role, 'owner')) redirect('/organisateur');
  return (
    <main className="org org-page">
      <p className="org__back"><Link href="/organisateur">← Accueil</Link></p>
      <h1 className="org-head__title">Paramètres de l’organisation</h1>
      <p className="script">{current.name}</p>
      <OrgSettingsForm org={{ id: current.id, name: current.name, legal_form: current.legal_form ?? '', siret: current.siret ?? '', responsible_name: current.responsible_name ?? '', address: current.address ?? '', contact_email: current.contact_email ?? '' }} />
    </main>
  );
}
