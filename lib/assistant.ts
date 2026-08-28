// Assistant (chatbot) LA SUNSHINES — SERVEUR UNIQUEMENT.
// Appelé par app/api/assistant/route.ts. La clé Mistral ne quitte jamais le serveur.

import { Mistral } from '@mistralai/mistralai';
import { Resend } from 'resend';
import { getAllEditions } from './content';
import { isEditionUpcoming } from './editions';
import { formatEditionDate } from './format';
import { readStore, writeStore, newId, type StoredTicket } from './store';

const MODEL = 'mistral-small-latest';
const TICKET_TO = 'themouv2.0971@gmail.com';
const FROM = 'LA SUNSHINES <onboarding@resend.dev>';

export const MAX_TURNS = 24; // limite de messages par session (client + serveur)

export function assistantConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/* --------------------------- system prompt --------------------------- */

const REFUND_POLICY = `POLITIQUE DE REMBOURSEMENT (à respecter STRICTEMENT) :
- Un billet est remboursable UNIQUEMENT si l'événement est officiellement annulé.
- Toute demande de remboursement se fait DIRECTEMENT auprès de Bizouk (la billetterie), pas auprès de LA SUNSHINES.
- Ne promets JAMAIS un remboursement, ne dis jamais que LA SUNSHINES remboursera.
- En cas de problème de billet (non reçu, erreur, remboursement pour annulation), propose de créer une demande de contact via l'outil create_support_ticket après avoir recueilli : nom, email, téléphone (optionnel), et le motif précis.`;

const INFOS_BLOCK = `INFOS PRATIQUES :
- Soirées réservées aux 12–17 ans, contrôle d'identité à l'entrée (une pièce justifiant l'âge est demandée).
- Billetterie : préventes sur Bizouk et Kiwol, 100 % sécurisées. Pas de vente sur place garantie.
- Encadrement : sécurité et staff dédiés toute la soirée.
- Tenue : un dresscode est communiqué pour chaque édition, il est obligatoire.
- Accès : dépose et récupération encadrées ; un adulte responsable doit venir chercher le/la mineur·e à l'heure de fin.`;

const RULES_BLOCK = `RÈGLEMENT (page /interdits) :
- Dresscode obligatoire, tenue correcte exigée, chaussures fermées recommandées.
- Interdits : alcool, cigarettes, chicha, substances illicites, objets dangereux, nourriture/boissons de l'extérieur, gros sacs.
- Contrôle systématique à l'entrée : palpation, contrôle des sacs, billet + pièce d'identité, vérification de l'âge (12–17 ans).
- Aucune violence ni harcèlement ; tout comportement dangereux = exclusion immédiate sans remboursement.
- Billet nominatif, une entrée par billet, pas de ré-entrée après sortie.`;

function editionsBlock(): string {
  const eds = getAllEditions();
  const lines = eds.map((e) => {
    const when = e.dateISO ? formatEditionDate(e.dateISO) : e.dateFull;
    const status = isEditionUpcoming(e) ? 'À VENIR' : 'passée';
    const lieu = e.venue ? `, ${e.venue}` : '';
    const head = e.headliner ? ` — têtes d'affiche : ${e.headliner}` : '';
    const bil = isEditionUpcoming(e) && e.bizoukUrl ? ` — billetterie : ${e.bizoukUrl}` : '';
    return `- [${status}] ${e.name} : ${when}${e.timeLabel ? ` (${e.timeLabel})` : ''}${lieu} — dresscode : ${e.dresscode}${head}${bil}`;
  });
  return `ÉDITIONS (source de vérité, ne rien inventer d'autre) :\n${lines.join('\n')}`;
}

export function buildSystemPrompt(): string {
  return [
    `Tu es l'assistant du site LA SUNSHINES, l'organisation de soirées pour les 12–17 ans en Guadeloupe.`,
    `Tu réponds en français, de façon brève, chaleureuse et claire. Tu tutoies.`,
    `Tu ne parles QUE de LA SUNSHINES : éditions, billetterie, infos pratiques, règlement, accès, tenue, et demandes de contact. Pour toute autre question, redirige poliment vers la page de contact du site.`,
    `Ne fais AUCUNE promesse que tu ne peux pas tenir. Si tu ne sais pas, dis-le et propose la page /contact.`,
    ``,
    editionsBlock(),
    ``,
    INFOS_BLOCK,
    ``,
    RULES_BLOCK,
    ``,
    REFUND_POLICY,
    ``,
    `Quand un visiteur a un problème qui nécessite un suivi humain (remboursement pour annulation, billet non reçu, réclamation, demande spécifique), utilise l'outil create_support_ticket UNIQUEMENT après avoir obtenu son nom et un email valide. Confirme-lui ensuite que la demande a bien été transmise et qu'il recevra un email de confirmation.`,
  ].join('\n');
}

/* --------------------------- tool --------------------------- */

const TICKET_TOOL = {
  type: 'function' as const,
  function: {
    name: 'create_support_ticket',
    description:
      "Crée une demande de contact/support pour l'équipe LA SUNSHINES et envoie les emails. À utiliser seulement avec le consentement du visiteur et un email valide.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom du visiteur' },
        email: { type: 'string', description: 'Email valide du visiteur' },
        phone: { type: 'string', description: 'Téléphone (optionnel)' },
        subject: {
          type: 'string',
          description: 'Motif court, ex. "Remboursement (annulation)", "Billet non reçu"',
        },
        message: {
          type: 'string',
          description: 'Résumé clair de la demande à partir de la conversation',
        },
      },
      required: ['name', 'email', 'subject', 'message'],
    },
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createTicket(args: Record<string, unknown>): Promise<{
  ok: boolean;
  detail: string;
  ticket?: StoredTicket;
}> {
  const name = String(args.name ?? '').trim().slice(0, 120);
  const email = String(args.email ?? '').trim().slice(0, 160);
  const phone = String(args.phone ?? '').trim().slice(0, 40);
  const subject = String(args.subject ?? '').trim().slice(0, 160) || 'Demande via assistant';
  const message = String(args.message ?? '').trim().slice(0, 4000);

  if (!name || !EMAIL_RE.test(email) || !message) {
    return { ok: false, detail: 'Nom, email valide et message sont requis.' };
  }

  const ticket: StoredTicket = {
    id: newId(),
    name,
    email,
    phone,
    subject,
    message,
    status: 'open',
    createdAt: new Date().toISOString(),
  };

  const store = await readStore();
  store.tickets.unshift(ticket);
  await writeStore(store);

  // Emails (best-effort : un échec n'annule pas le ticket)
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: FROM,
        to: [TICKET_TO],
        replyTo: email,
        subject: `[Assistant] ${subject}`,
        text:
          `Nouvelle demande via l'assistant du site.\n\n` +
          `Nom      : ${name}\n` +
          `Email    : ${email}\n` +
          `Téléphone: ${phone || '—'}\n` +
          `Motif    : ${subject}\n\n` +
          `${message}\n\n` +
          `Ticket #${ticket.id} — à traiter dans /admin.`,
      });
      await resend.emails.send({
        from: FROM,
        to: [email],
        subject: 'On a bien reçu ta demande — LA SUNSHINES',
        text:
          `Salut ${name},\n\n` +
          `On a bien reçu ta demande : « ${subject} ».\n` +
          `L'équipe LA SUNSHINES revient vers toi rapidement par email.\n\n` +
          `Rappel : pour un remboursement (uniquement en cas d'annulation), la demande se fait directement auprès de Bizouk.\n\n` +
          `À très vite,\nL'équipe LA SUNSHINES`,
      });
    } catch (e) {
      console.error('[assistant] envoi email ticket échoué :', e);
    }
  } else {
    console.warn('[assistant] RESEND_API_KEY absente — ticket créé sans email.');
  }

  return {
    ok: true,
    detail: `Ticket créé (#${ticket.id}). Emails de notification et de confirmation envoyés à ${email}.`,
    ticket,
  };
}

/* --------------------------- run --------------------------- */

type MistralMsg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: unknown[] }
  | { role: 'tool'; name: string; toolCallId: string; content: string };

export async function runAssistant(history: ChatMessage[]): Promise<{
  reply: string;
  ticketCreated: boolean;
}> {
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  const messages: MistralMsg[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...history.slice(-MAX_TURNS).map((m) => ({
      role: m.role,
      content: String(m.content ?? '').slice(0, 2000),
    })),
  ];

  let ticketCreated = false;

  // 1er appel
  const first = await client.chat.complete({
    model: MODEL,
    temperature: 0.3,
    maxTokens: 600,
    tools: [TICKET_TOOL],
    toolChoice: 'auto',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
  });

  const choice = first.choices?.[0]?.message;
  const toolCalls = (choice?.toolCalls ?? []) as Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;

  if (toolCalls.length > 0) {
    messages.push({
      role: 'assistant',
      content: typeof choice?.content === 'string' ? choice.content : null,
      toolCalls: choice?.toolCalls as unknown[],
    });

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function?.arguments ?? '{}');
      } catch {
        /* args invalides */
      }
      let result: { ok: boolean; detail: string };
      if (tc.function?.name === 'create_support_ticket') {
        const r = await createTicket(args);
        ticketCreated = r.ok;
        result = { ok: r.ok, detail: r.detail };
      } else {
        result = { ok: false, detail: 'Outil inconnu.' };
      }
      messages.push({
        role: 'tool',
        name: tc.function?.name ?? 'unknown',
        toolCallId: tc.id ?? '',
        content: JSON.stringify(result),
      });
    }

    const second = await client.chat.complete({
      model: MODEL,
      temperature: 0.3,
      maxTokens: 600,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
    });
    const reply = textOf(second.choices?.[0]?.message?.content);
    return { reply: reply || 'C’est noté, je transmets ta demande à l’équipe.', ticketCreated };
  }

  return { reply: textOf(choice?.content) || 'Désolé, peux-tu reformuler ?', ticketCreated };
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : '',
      )
      .join('')
      .trim();
  }
  return '';
}
