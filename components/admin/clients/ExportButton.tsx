'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import { clientsSearchParams, type ClientsQuery } from '@/lib/admin/clients/query';

/** Export CSV du résultat filtré (super-admin). Avertissement RGPD obligatoire ; les mineurs ne sont inclus que sur case explicite ; l'export est journalisé côté serveur. */
export default function ExportButton({ query, total }: { query: ClientsQuery; total: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [ack, setAck] = useState(false); const [minors, setMinors] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => { const d = ref.current; if (!d) return; const onClose = () => { setAck(false); setMinors(false); setDone(false); }; d.addEventListener('close', onClose); return () => d.removeEventListener('close', onClose); }, []);
  function download() {
    const p = clientsSearchParams({ ...query, page: 1 }); p.set('ack', '1'); if (minors) p.set('mineurs_inclus', '1');
    window.location.assign(`/api/admin-clients/export?${p.toString()}`);
    setDone(true);
  }
  return (
    <>
      <button type="button" className="btn btn--ghost clients-export" onClick={() => ref.current?.showModal()} disabled={total === 0}><Icon name="download" className="icon" />Exporter en CSV</button>
      <dialog ref={ref} className="clients-dialog" aria-labelledby="exp-title">
        <h2 id="exp-title">Exporter {total.toLocaleString('fr-FR')} compte{total > 1 ? 's' : ''} en CSV</h2>
        <div className="ef-warn" role="note"><strong>Données personnelles (RGPD).</strong> Ce fichier contient des noms, e-mails, téléphones et dates de naissance. Utilise-le uniquement pour la mission qui le justifie,
          conserve-le sur un poste protégé, ne le transfère pas par messagerie et supprime-le dès qu’il n’est plus utile. Cet export est enregistré dans le journal d’audit (qui, quand, quels filtres, combien de lignes).</div>
        <label className="ef-check"><input type="checkbox" checked={minors} onChange={(e) => setMinors(e.target.checked)} />Inclure les mineurs (moins de 18 ans)</label>
        <p className="ef-help">Par défaut, les comptes de mineurs sont exclus de l’export. Ne les inclus que si c’est indispensable : leurs données méritent une protection renforcée.</p>
        <label className="ef-check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />J’ai lu l’avertissement et je m’engage à protéger ces données.</label>
        {done && <p className="ef-help" role="status">Téléchargement lancé. Fichier CSV en UTF-8 (ouvre-le dans Excel via « Données → Depuis un fichier texte » si les accents s’affichent mal).</p>}
        <div className="ef-row">
          <button type="button" className="btn btn--amber" disabled={!ack} onClick={download}>Télécharger le CSV</button>
          <button type="button" className="ef-link" onClick={() => ref.current?.close()}>Fermer</button>
        </div>
      </dialog>
    </>
  );
}
