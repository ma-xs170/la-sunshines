import { NextResponse } from 'next/server';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { handleStripeEvent } from '@/lib/ticketing/fulfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/stripe/webhook
//  * lit le corps BRUT (request.text()) : la signature porte sur les octets exacts ;
//    le middleware exclut cette route (voir matcher) ;
//  * vérifie la signature Stripe ; sinon 400 ;
//  * idempotent : un événement déjà traité (stripe_events) est ignoré ;
//  * en cas d'erreur transitoire → 500 : Stripe rejoue l'événement.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !stripeConfigured() || !supabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Webhook non configuré.' }, { status: 503 });
  }
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Signature manquante.' }, { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const claim = await db.rpc('claim_stripe_event', { p_id: event.id, p_type: event.type });
  if (claim.error) {
    console.error('[webhook] claim_stripe_event :', claim.error);
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
  if (claim.data === 'duplicate') return NextResponse.json({ received: true, duplicate: true });

  try {
    const result = await handleStripeEvent(db, event);
    await db.rpc('finish_stripe_event', {
      p_id: event.id,
      p_ok: result.ok,
      p_error: result.ok ? null : result.error,
    });
    // Un cas métier à examiner à la main (ex. montant incohérent) est enregistré « failed »
    // mais répondu 200 : le rejouer ne changerait rien.
    return NextResponse.json({ received: true, note: result.ok ? result.note : undefined });
  } catch (e) {
    console.error('[webhook] traitement en échec :', event.type, event.id, e);
    await db.rpc('finish_stripe_event', {
      p_id: event.id,
      p_ok: false,
      p_error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Traitement en échec.' }, { status: 500 });
  }
}
