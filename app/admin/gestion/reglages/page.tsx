import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/adminSpace';
import { getAdminShellData } from '@/lib/admin/shell-data';
import MailDiagPanel from '@/components/admin/MailDiagPanel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Réglages · Admin', robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const s = await requireAdminPage('/admin/gestion/reglages');
  const d = await getAdminShellData().catch(() => null);
  return (
    <>
      <h1 className="org-head__title">Réglages</h1>
      <div className="ef">
        <section className="glass ef-card"><h2>Mon compte administrateur</h2>
          <ul className="ef-list">
            <li><span>Nom</span><strong>{`${s.profile.first_name} ${s.profile.last_name}`.trim() || '—'}</strong></li>
            <li><span>E-mail</span><strong>{s.email}</strong></li>
            <li><span>Référence</span><strong>{d?.reference ?? '—'}</strong></li>
            <li><span>Niveau</span><strong>{d?.isSuper ? 'Super-administrateur' : 'Administrateur'}</strong></li>
          </ul>
          <div className="ef-row"><a className="btn btn--outline" href="/compte">Mon compte et mot de passe</a></div>
        </section>
        <section className="glass ef-card"><h2>Réglages de la plateforme</h2>
          <p className="ef-help">Le mode de billetterie (Bizouk ou interne) et les frais de service se règlent dans la rubrique Billetterie.</p>
          <div className="ef-row"><a className="btn btn--amber" href="/admin/billetterie">Mode et frais de billetterie</a><a className="btn btn--outline" href="/admin/contenu">Contenu du site</a></div>
        </section>
        <MailDiagPanel myEmail={s.email} />
      </div>
    </>
  );
}
