'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Arrêt d'urgence (fermer les ventes), réouverture, ou dépublication d'un évènement — par un admin, sur n'importe quelle organisation. */
export default function EventStatusActions({ slug, status }: { slug: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(next: 'draft' | 'published' | 'closed', prompt: string) {
    const reason = window.prompt(prompt);
    if (reason === null) return;
    if (reason.trim().length < 3) { window.alert('Le motif doit faire au moins 3 caractères.'); return; }
    setBusy(true);
    const r = await fetch(`/api/billetterie/admin/events/${slug}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next, reason: reason.trim() }) });
    setBusy(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); window.alert(j.error ?? 'Action impossible.'); return; }
    router.refresh();
  }

  if (status === 'cancelled') return null;
  if (status === 'draft') return <p className="org-muted">Première publication : <Link href="/admin/gestion/publications">file « Publications à valider »</Link>.</p>;
  return (
    <div className="admin-form__actions">
      {status === 'published' && <button className="admin-mini" disabled={busy} onClick={() => set('closed', 'ARRÊT D’URGENCE : ferme immédiatement les ventes de cet évènement.\n\nMotif (obligatoire) :')}>Fermer les ventes</button>}
      {status === 'closed' && <button className="admin-mini" disabled={busy} onClick={() => set('published', 'Rouvrir les ventes de cet évènement.\n\nMotif (obligatoire) :')}>Rouvrir les ventes</button>}
      <button className="admin-mini" disabled={busy} onClick={() => set('draft', 'DÉPUBLIER cet évènement (retour en brouillon, invisible du public).\n\nMotif (obligatoire) :')}>Dépublier</button>
    </div>
  );
}
