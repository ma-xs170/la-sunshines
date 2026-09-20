import { servePdf } from '@/lib/ticketing/pdf/serve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/orders/[id]/pdf — PDF regroupant tous les billets valides d'une commande (une page par billet).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return servePdf('order', (await params).id);
}
