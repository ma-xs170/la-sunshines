import { ImageResponse } from 'next/og';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { qrDataUrl } from '@/lib/ticketing/qr';
import { formatCode } from '@/lib/ticketing/tokens';
import { formatGp } from '@/lib/ticketing/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tickets/[id]/image[?download=1] — le billet complet en PNG (événement, date, lieu,
// tarif, participant, QR). RLS : uniquement SES billets.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!supabaseConfigured() || !z.uuid().safeParse(id).success) return new Response('Introuvable', { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('tickets')
    .select('code, status, holder_first_name, holder_last_name, order_items(event_title, event_starts_at, venue_name, venue_address, tier_name), orders(order_number)')
    .eq('id', id)
    .maybeSingle();
  if (!t || !['valid', 'used'].includes(t.status)) return new Response('Introuvable', { status: 404 });

  const item = t.order_items as unknown as { event_title: string; event_starts_at: string; venue_name: string; venue_address: string; tier_name: string };
  const order = t.orders as unknown as { order_number: string };
  const qr = await qrDataUrl(t.code, 640);
  const download = new URL(req.url).searchParams.get('download') === '1';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#FFF8EE', padding: 56, color: '#191410' }}>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: '#A5670F' }}>LA SUNSHINES</div>
        <div style={{ display: 'flex', fontSize: 62, fontWeight: 800, marginTop: 20, lineHeight: 1.05 }}>{item.event_title}</div>
        <div style={{ display: 'flex', fontSize: 32, marginTop: 18 }}>{formatGp(item.event_starts_at)}</div>
        <div style={{ display: 'flex', fontSize: 28, marginTop: 6, color: '#6b6358' }}>{item.venue_name}{item.venue_address ? ` — ${item.venue_address}` : ''}</div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={520} height={520} alt="" style={{ background: '#fff', padding: 12, borderRadius: 24 }} />
        </div>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, justifyContent: 'center' }}>{t.holder_first_name} {t.holder_last_name}</div>
        <div style={{ display: 'flex', fontSize: 28, justifyContent: 'center', marginTop: 6 }}>{item.tier_name} · {order.order_number}</div>
        <div style={{ display: 'flex', fontSize: 22, justifyContent: 'center', marginTop: 12, color: '#6b6358', letterSpacing: 2 }}>{formatCode(t.code)}</div>
      </div>
    ),
    {
      width: 1080,
      height: 1500,
      headers: {
        'Cache-Control': 'private, no-store',
        ...(download ? { 'Content-Disposition': `attachment; filename="billet-${order.order_number}.png"` } : {}),
      },
    },
  );
}
