// Emails de commande — branché en phase 4. Ne lève JAMAIS d'exception (l'échec d'un
// email ne doit pas faire échouer un webhook).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function afterOrderPaid(_db: SupabaseClient, _orderId: string): Promise<void> {
  /* phase 4 */
}
export async function afterStockLost(_db: SupabaseClient, _orderId: string): Promise<void> {
  /* phase 4 */
}
