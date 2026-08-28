// Extraction assistée du contenu d'un flyer via Mistral AI (vision / Pixtral).
// SERVEUR UNIQUEMENT — appelé par app/api/admin/flyer-analyze/route.ts.
//
// Ne fait QUE proposer une suggestion : les champs sont pré-remplis dans /admin,
// jamais publiés automatiquement (relecture humaine obligatoire).

import { Mistral } from '@mistralai/mistralai';

export type FlyerAnalysis = {
  headliner: string;
  lineup: string[];
  date: string;
  heure: string;
  lieu: string;
  dresscode: string;
};

// Modèle vision de Mistral (Pixtral 12B — couvert par le palier gratuit).
// Changer ici si besoin : 'pixtral-large-latest' ou 'mistral-small-latest'.
const MODEL = 'pixtral-12b-2409';

/** Clé API Mistral présente ? */
export function mistralConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

const PROMPT = `Tu analyses l'affiche (flyer) d'une soirée de l'organisation « LA SUNSHINES ».
Extrais uniquement ce qui est RÉELLEMENT écrit / lisible sur l'image.

Réponds STRICTEMENT avec un objet JSON (aucun texte autour), clés exactes :
{
  "headliner": string,   // tête(s) d'affiche = le(s) nom(s) d'artiste écrits le plus GROS / le plus mis en avant. Si plusieurs, les séparer par " · ". "" si rien de clairement mis en avant.
  "lineup": string[],     // TOUS les autres noms d'artistes / DJ visibles, hors têtes d'affiche déjà dans "headliner". [] si aucun.
  "date": string,         // la date telle qu'écrite, ex "Sam. 17 Octobre" ou "17/10". "" si absente.
  "heure": string,        // la plage horaire, ex "16h–22h". "" si absente.
  "lieu": string,         // salle / club / ville si écrit noir sur blanc. "" si absent.
  "dresscode": string     // dresscode ou thème couleur si écrit, ex "Bleu ou noir". "" si absent.
}

Règles :
- N'INVENTE RIEN. Si une info n'est pas lisible, laisse "" (ou [] pour lineup).
- Ignore "LA SUNSHINES", "DJ LA SUNSHINES", "LA XPLOZ" : nom de l'organisation, pas un artiste.
- N'inclus pas les logos de sponsors / lieux / billetterie (Bizouk, Kiwol, W Club...) dans "lineup".
- Garde les noms d'artiste tels qu'écrits (avec "DJ " s'il est présent).`;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function stripFences(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return (fence ? fence[1] : t).trim();
}

/** Récupère le texte de la réponse Mistral (content = string ou tableau de chunks). */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : '',
      )
      .join('');
  }
  return '';
}

export async function analyzeFlyer(dataUrl: string): Promise<FlyerAnalysis> {
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl.trim())) {
    throw new Error('image invalide (data URL base64 attendue)');
  }

  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  const res = await client.chat.complete({
    model: MODEL,
    temperature: 0,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', imageUrl: dataUrl.trim() },
        ],
      },
    ],
  });

  const raw = stripFences(extractText(res.choices?.[0]?.message?.content));
  if (!raw) throw new Error('réponse vide du modèle');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('réponse du modèle illisible (JSON invalide)');
  }

  return {
    headliner: str(parsed.headliner),
    lineup: Array.isArray(parsed.lineup) ? parsed.lineup.map(str).filter(Boolean) : [],
    date: str(parsed.date),
    heure: str(parsed.heure),
    lieu: str(parsed.lieu),
    dresscode: str(parsed.dresscode),
  };
}

/** Ping léger : vérifie que la clé et le service répondent (sans image). */
export async function pingMistral(): Promise<{ ok: boolean; detail: string }> {
  if (!mistralConfigured()) return { ok: false, detail: 'MISTRAL_API_KEY absente' };
  try {
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
    const res = await client.chat.complete({
      model: MODEL,
      maxTokens: 5,
      messages: [{ role: 'user', content: 'ping' }],
    });
    const txt = extractText(res.choices?.[0]?.message?.content).slice(0, 40);
    return { ok: true, detail: `modèle ${MODEL} OK (réponse: "${txt}")` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'erreur inconnue' };
  }
}
