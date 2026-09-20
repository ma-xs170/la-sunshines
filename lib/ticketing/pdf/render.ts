// Rendu des billets PDF (un billet = une page). SERVEUR UNIQUEMENT ; pas de Puppeteer : @react-pdf/renderer.

import 'server-only';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { qrPng } from '../qr';
import { registerPdfFonts, logoPng } from './assets';
import { TicketsDocument, type RenderedTicket } from './TicketDocument';
import type { TicketPageData } from './data';

export async function renderTicketsPdf(pages: TicketPageData[], title: string): Promise<Buffer> {
  registerPdfFonts();
  const logo = await logoPng();
  const tickets: RenderedTicket[] = await Promise.all(pages.map(async (p) => ({ ...p, qr: await qrPng(p.code, 520), logo })));
  // eslint-disable-next-line react/no-children-prop
  return renderToBuffer(React.createElement(TicketsDocument, { tickets, title }) as Parameters<typeof renderToBuffer>[0]);
}
