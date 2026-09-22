import type { Metadata } from 'next';
import CancellationTemplatesPanel, { type TemplateRow } from '@/components/admin/CancellationTemplatesPanel';
import { adminRpc, requireAdminPage } from '@/lib/adminSpace';
import '@/components/organizer/wizard.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Modèles d’annulation · Admin', robots: { index: false, follow: false } };

export default async function CancellationTemplatesPage() {
  const s = await requireAdminPage('/admin/gestion/reglages/annulation');
  const r = await adminRpc<TemplateRow[]>('admin_cancellation_templates', { p_actor: s.userId });
  return (
    <>
      <p className="org__back"><a href="/admin/gestion/reglages">← Réglages</a></p>
      <h1 className="org-head__title">Modèles d’annulation</h1>
      <p className="ef-help">Texte pré-rempli automatiquement pour chaque raison, quand un organisateur annule un évènement. Une organisation peut avoir sa propre version ; à défaut, c’est celle-ci qui est utilisée.</p>
      {r.ok ? <CancellationTemplatesPanel initial={r.data} /> : <p className="admin-error" role="alert">{r.message}</p>}
    </>
  );
}
