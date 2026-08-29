import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';

// Proxy Google Places Autocomplete (New) — la clé reste 100 % serveur.
// GET /api/admin/places?q=mot-clé  →  { configured: bool, suggestions: string[] }
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// biais géographique : centre Guadeloupe, rayon large
const GUADELOUPE = { latitude: 16.25, longitude: -61.55 };
const BIAS_RADIUS_M = 120_000;

export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ configured: false, suggestions: [] });
  }

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) {
    return NextResponse.json({ configured: true, suggestions: [] });
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify({
        input: q,
        languageCode: 'fr',
        regionCode: 'GP',
        locationBias: {
          circle: { center: GUADELOUPE, radius: BIAS_RADIUS_M },
        },
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[places] Google', res.status, body.slice(0, 200));
      return NextResponse.json(
        { configured: true, suggestions: [], error: `Google Places ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      suggestions?: {
        placePrediction?: { text?: { text?: string } };
      }[];
    };
    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction?.text?.text)
      .filter((t): t is string => Boolean(t))
      .slice(0, 6);

    return NextResponse.json({ configured: true, suggestions });
  } catch (e) {
    console.error('[places] injoignable', e);
    return NextResponse.json(
      { configured: true, suggestions: [], error: 'Google Places injoignable.' },
      { status: 502 },
    );
  }
}
