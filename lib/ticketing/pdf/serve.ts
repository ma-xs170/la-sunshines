// Réponse HTTP d'un billet PDF ou d'un PDF de commande, avec contrôle d'accès. SERVEUR UNIQUEMENT.
//
// Accès : propriétaire du billet (compte connecté) ou admin, JAMAIS quelqu'un d'autre.
//  * non connecté → 401 ; billet / commande d'un autre → 404 (même réponse qu'un identifiant inexistant : rien à deviner) ;
//  * billet annulé ou remboursé → 410 (pas de PDF) ; un PDF de commande ne contient que les billets valides ou utilisés.
// Les identifiants sont des UUID v4 (non devinables) ET l'accès exige une session : deux barrières indépendantes.

import 'server-only';
import { z } from 'zod';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { loadTicketPages } from './data';
import { renderTicketsPdf } from './render';

const json = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function servePdf(kind: 'ticket' | 'order', id: string): Promise<Response> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return json(503, 'PDF indisponible.');
  if (!z.uuid().safeParse(id).success) return json(404, 'Introuvable.');
  const session = await getSession();
  if (!session) return json(401, 'Connexion requise.');

  const pages = await loadTicketPages(createSupabaseAdminClient(), kind === 'ticket' ? { ticketId: id } : { orderId: id });
  if (pages.length === 0) return json(404, 'Introuvable.');
  const isAdmin = session.profile.role === 'admin';
  if (!isAdmin && !pages.every((p) => p.ownerId === session.userId)) return json(404, 'Introuvable.');

  const active = pages.filter((p) => p.status === 'valid' || p.status === 'used');
  if (active.length === 0 || (kind === 'ticket' && active.length !== pages.length)) return json(410, 'Billet annulé ou remboursé : le PDF n’est plus disponible.');

  try {
    const pdf = await renderTicketsPdf(active, kind === 'ticket' ? `Billet ${active[0].reference}` : `Billets ${active[0].orderNumber}`);
    const name = kind === 'ticket' ? `billet-${active[0].reference}.pdf` : `billets-${active[0].orderNumber}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[pdf] génération impossible :', e instanceof Error ? e.message : e);
    return json(500, 'Impossible de générer le PDF pour l’instant. Réessaie.');
  }
}
