'use client';

import { useState } from 'react';
import MessageComposer, { type MessageRow } from './MessageComposer';
import type { OrgParticipant } from '@/lib/organizer/data';

const STATUS: Record<string, string> = { valid: 'Valide', used: 'Entré', cancelled: 'Annulé', refunded: 'Remboursé' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Guadeloupe' }) : '');

function ResendButton({ slug, ticketId }: { slug: string; ticketId: string }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  async function go() {
    setSt('busy'); setMsg('');
    const r = await fetch(`/api/organisateur/events/${slug}/resend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setSt('ok'); else { setSt('err'); setMsg(j.error ?? 'Échec.'); }
  }
  return (
    <span className="org-resend">
      <button type="button" className="tk__pdf" onClick={go} disabled={st === 'busy' || st === 'ok'}>{st === 'busy' ? 'Envoi…' : st === 'ok' ? 'PDF envoyé ✓' : 'Renvoyer le PDF'}</button>
      {st === 'err' && <span className="admin-error" role="alert">{msg}</span>}
    </span>
  );
}

/** Tableau des participants (cartes sur mobile) : sélection, renvoi du billet PDF, message d'information. */
export default function ParticipantsPanel({ slug, rows, canManage, tiers, history, replyTo }: {
  slug: string; rows: OrgParticipant[]; canManage: boolean; tiers: { id: string; name: string }[]; history: MessageRow[]; replyTo: string;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const active = (s: string) => s === 'valid' || s === 'used';
  const selectable = rows.filter((r) => active(r.status)).map((r) => r.id);

  return (
    <>
      {rows.length === 0 ? (
        <div className="glass org-empty"><h3>Aucun participant</h3><p>Aucun billet ne correspond à ces filtres.</p></div>
      ) : (
        <div className="org-table glass">
          <table>
            <thead>
              <tr>
                {canManage && <th className="org-table__chk"><input type="checkbox" aria-label="Tout sélectionner sur cette page" checked={sel.length > 0 && selectable.every((id) => sel.includes(id))} onChange={(e) => setSel(e.target.checked ? selectable : [])} /></th>}
                <th>Participant</th><th>Email</th><th>Téléphone</th><th>Tarif</th><th>Référence</th><th>Statut</th><th>Entrée</th>{canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={active(r.status) ? '' : 'is-off'}>
                  {canManage && <td className="org-table__chk" data-label=""><input type="checkbox" aria-label={`Sélectionner ${r.holder_first_name} ${r.holder_last_name}`} disabled={!active(r.status)} checked={sel.includes(r.id)} onChange={() => toggle(r.id)} /></td>}
                  <td data-label="Participant"><strong>{r.holder_first_name} {r.holder_last_name}</strong></td>
                  <td data-label="Email">{r.buyer_email}</td>
                  <td data-label="Téléphone">{r.buyer_phone || '—'}</td>
                  <td data-label="Tarif">{r.tier_name}</td>
                  <td data-label="Référence"><code>{r.reference}</code></td>
                  <td data-label="Statut"><span className={`tk__badge tk__badge--${r.status}`}>{STATUS[r.status] ?? r.status}</span></td>
                  <td data-label="Entrée">{r.status === 'used' ? `Entré · ${fmt(r.used_at)}` : 'Non'}</td>
                  {canManage && <td data-label="">{active(r.status) && <ResendButton slug={slug} ticketId={r.id} />}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage
        ? <MessageComposer slug={slug} tiers={tiers} selected={sel} history={history} replyTo={replyTo} />
        : <p className="org-muted">Ton rôle est en lecture seule : l’envoi de messages, le renvoi de billets et l’export sont réservés aux responsables.</p>}
    </>
  );
}
