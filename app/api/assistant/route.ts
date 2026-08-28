import { NextResponse } from 'next/server';
import {
  assistantConfigured,
  runAssistant,
  MAX_TURNS,
  type ChatMessage,
} from '@/lib/assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/assistant  — body { messages: {role:'user'|'assistant', content:string}[] }
// -> { reply: string, ticketCreated?: boolean }
// La clé Mistral reste 100 % serveur. Pas d'auth (chatbot public), mais la
// conversation est plafonnée (MAX_TURNS) et chaque message est tronqué.
export async function POST(req: Request) {
  if (!assistantConfigured()) {
    return NextResponse.json(
      {
        error:
          'L’assistant est momentanément indisponible. Écris-nous via la page Contact.',
        fallback: '/contact',
      },
      { status: 503 },
    );
  }

  let body: { messages?: unknown };
  try {
    body = (await req.json()) as { messages?: unknown };
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = raw
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === 'object' &&
        (m as ChatMessage).role !== undefined &&
        typeof (m as ChatMessage).content === 'string',
    )
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  if (messages.length === 0) {
    return NextResponse.json({ error: 'Message vide.' }, { status: 400 });
  }
  if (messages.length > MAX_TURNS) {
    return NextResponse.json(
      {
        error: `Conversation trop longue (limite ${MAX_TURNS} messages). Recharge la page pour repartir, ou passe par la page Contact.`,
        fallback: '/contact',
      },
      { status: 429 },
    );
  }

  try {
    const { reply, ticketCreated } = await runAssistant(messages);
    return NextResponse.json({ reply, ticketCreated });
  } catch (e) {
    console.error('[assistant] erreur :', e);
    return NextResponse.json(
      {
        error:
          'L’assistant a rencontré un souci. Réessaie, ou écris-nous via la page Contact.',
        fallback: '/contact',
      },
      { status: 502 },
    );
  }
}
