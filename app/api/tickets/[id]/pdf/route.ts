import { servePdf } from '@/lib/ticketing/pdf/serve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/tickets/[id]/pdf — billet PDF (une page). Propriétaire connecté ou admin ; billet annulé / remboursé → 410.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return servePdf('ticket', (await params).id);
}
