import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { getSession } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { formatCode } from '@/lib/ticketing/tokens';
import { formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mon billet · LA SUNSHINES', robots: { index: false } };

const TICKET_LABEL: Record<string, string> = { valid: 'Valide', used: 'Déjà utilisé', cancelled: 'Annulé', refunded: 'Remboursé' };

interface Item { event_title: string; event_starts_at: string; venue_name: string; venue_address: string; tier_name: string }

// Page d'un billet : QR, événement, date, lieu, tarif, participant. Lecture sous RLS →
// le billet d'un autre client renvoie 404. Le billet reste accessible même si l'email a échoué.
export default async function BilletPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = supabaseConfigured() ? await getSession() : null;
  if (!session) redirect(`/connexion?next=${encodeURIComponent('/compte/billets/' + id)}`);

  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('tickets')
    .select('id, code, reference, status, used_at, holder_first_name, holder_last_name, order_items(event_title, event_starts_at, venue_name, venue_address, tier_name), orders(order_number)')
    .eq('id', id)
    .maybeSingle();
  if (!t) notFound();
  const item = t.order_items as unknown as Item;
  const order = t.orders as unknown as { order_number: string };
  const active = t.status === 'valid' || t.status === 'used';

  return (
    <>
      <Nav />
      <main className="auth content-page tk">
        <PageHero eyebrow={`Commande ${order.order_number}`} title={item.event_title} />
        <div className="tk__ticket glass">
          {active ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="tk__qr" src={`/api/tickets/${t.id}/qr`} alt="QR code du billet" width={280} height={280} />
          ) : (
            <p className="tk__void">Ce billet n’est plus valable.</p>
          )}
          <p className={`tk__badge tk__badge--${t.status}`}>{TICKET_LABEL[t.status] ?? t.status}</p>
          <dl className="tk__dl">
            <div><dt>Participant</dt><dd>{t.holder_first_name} {t.holder_last_name}</dd></div>
            <div><dt>Tarif</dt><dd>{item.tier_name}</dd></div>
            <div><dt>Date</dt><dd>{formatGp(item.event_starts_at)}</dd></div>
            <div><dt>Lieu</dt><dd>{item.venue_name}{item.venue_address ? ` — ${item.venue_address}` : ''}</dd></div>
            {t.status === 'used' && t.used_at && <div><dt>Scanné le</dt><dd>{formatGp(t.used_at)}</dd></div>}
          </dl>
          <dl className="tk__dl"><div><dt>Référence</dt><dd>{t.reference}</dd></div></dl>
          {active && <p className="tk__code" aria-label="Code du billet">{formatCode(t.code)}</p>}
          <div className="auth-actions">
            {active && <a className="btn btn--amber" href={`/api/tickets/${t.id}/pdf`}>Télécharger le PDF</a>}
            {active && <a className="btn btn--outline" href={`/api/tickets/${t.id}/image?download=1`}>Image du QR</a>}
            <a className="btn btn--outline" href="/compte/billets">Mes billets</a>
          </div>
          <p className="auth-hint">Présente ce QR code à l’entrée. Il n’est valable qu’une fois : ne le partage pas.</p>
        </div>
      </main>
      <Footer />
    </>
  );
}
