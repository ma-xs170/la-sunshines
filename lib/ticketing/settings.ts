// Réglages publics de la billetterie (table app_settings, lisible par tous).
// Toute défaillance (Supabase absent, réseau, table manquante) retombe sur les
// valeurs SÛRES : mode 'bizouk', frais à 0 → le site reste comme avant.

import { createSupabasePublicClient } from '@/lib/supabase/public';

export type TicketingMode = 'bizouk' | 'native';

export interface TicketingSettings {
  mode: TicketingMode;
  feePercent: number;
  feeFixedCents: number;
  termsVersion: string;
}

export const DEFAULT_SETTINGS: TicketingSettings = {
  mode: 'bizouk',
  feePercent: 0,
  feeFixedCents: 0,
  termsVersion: '',
};

export async function getTicketingSettings(live = false): Promise<TicketingSettings> {
  const supabase = createSupabasePublicClient(live);
  if (!supabase) return DEFAULT_SETTINGS;
  try {
    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error || !data) return DEFAULT_SETTINGS;
    const m = new Map(data.map((r) => [r.key as string, r.value as unknown]));
    const num = (k: string, max: number) => {
      const v = m.get(k);
      return typeof v === 'number' && v >= 0 && v <= max ? v : 0;
    };
    return {
      mode: m.get('ticketing_mode') === 'native' ? 'native' : 'bizouk',
      feePercent: num('fee_percent', 100),
      feeFixedCents: num('fee_fixed_cents', 5000),
      termsVersion: typeof m.get('terms_version') === 'string' ? (m.get('terms_version') as string) : '',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
