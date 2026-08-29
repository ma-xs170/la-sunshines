import { NextResponse } from 'next/server';

// Health-check des services clés, exécuté SERVEUR-SIDE (pas de CORS).
// Consommé par <StatusWidget> qui rafraîchit toutes les 60 s.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type State = 'ok' | 'slow' | 'down';
type Service = { id: string; label: string; state: State; ms: number | null };

const SLOW_MS = 2000; // > 2 s de réponse => "lent" (orange)
const TIMEOUT_MS = 6000;

async function probe(
  url: string,
  init: RequestInit = {},
): Promise<{ up: boolean; ms: number }> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      ...init,
      signal: ctrl.signal,
    });
    // pour un simple check de disponibilité : tout ce qui n'est pas une
    // erreur serveur (>=500) prouve que le service répond.
    return { up: res.status < 500, ms: Date.now() - started };
  } catch {
    return { up: false, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function grade(up: boolean, ms: number): State {
  if (!up) return 'down';
  return ms > SLOW_MS ? 'slow' : 'ok';
}

export async function GET() {
  const mistralKey = process.env.MISTRAL_API_KEY;

  const [bizouk, assistant, kiwol] = await Promise.all([
    // billetterie : le script widget chargé sur les pages événement
    probe('https://static.bizouk.com/lib/js/widget/widget_client.js'),
    // assistant IA : disponibilité de l'API Mistral (avec la clé si présente)
    probe('https://api.mistral.ai/v1/models', {
      headers: mistralKey ? { Authorization: `Bearer ${mistralKey}` } : undefined,
    }),
    // partenaire préventes
    probe('https://www.kiwol.com/', { method: 'HEAD' }),
  ]);

  const services: Service[] = [
    { id: 'site', label: 'Site LA SUNSHINES', state: 'ok', ms: 0 },
    {
      id: 'bizouk',
      label: 'Billetterie Bizouk',
      state: grade(bizouk.up, bizouk.ms),
      ms: bizouk.ms,
    },
    {
      id: 'assistant',
      label: 'Assistant IA',
      state: grade(assistant.up, assistant.ms),
      ms: assistant.ms,
    },
    {
      id: 'kiwol',
      label: 'Préventes Kiwol',
      state: grade(kiwol.up, kiwol.ms),
      ms: kiwol.ms,
    },
  ];

  const worst: State = services.some((s) => s.state === 'down')
    ? 'down'
    : services.some((s) => s.state === 'slow')
      ? 'slow'
      : 'ok';

  return NextResponse.json(
    { checkedAt: new Date().toISOString(), overall: worst, services },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
