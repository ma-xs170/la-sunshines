// Billet PDF « La Sunshines » : un billet = une page A4, mêmes polices et mêmes couleurs que le site
// (tokens de app/globals.css : crème #FFF8EE, ambre #FFB238 / #A5670F, corail #FF6B5B, encre #191410,
// verre blanc translucide, rayons 26 / 18 / 14). Rendu côté serveur avec @react-pdf/renderer.

import React from 'react';
import { Document, Page, View, Text, Image, Svg, Defs, RadialGradient, LinearGradient, Stop, Rect, StyleSheet } from '@react-pdf/renderer';
import type { TicketPageData } from './data';
import { formatPrice } from '../time';

// --- tokens du site (app/globals.css :root) ---
const C = {
  bg: '#FFF8EE', ink: '#191410', amber: '#FFB238', amberInk: '#A5670F', coral: '#FF6B5B',
  gray: 'rgba(25,20,16,0.64)', grayDim: 'rgba(25,20,16,0.46)',
  glass: 'rgba(255,255,255,0.72)', glassBorder: 'rgba(25,20,16,0.10)', line: 'rgba(25,20,16,0.08)',
};
const R = { lg: 26, md: 18, sm: 14 };

const s = StyleSheet.create({
  page: { backgroundColor: C.bg, padding: 34, fontFamily: 'Inter', color: C.ink, fontSize: 10, lineHeight: 1.4 },
  bg: { position: 'absolute', top: 0, left: 0, width: 595.28, height: 841.89 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 40, marginBottom: 14 },
  logo: { width: 141, height: 28 },
  script: { fontFamily: 'Caveat', fontWeight: 700, fontSize: 21, color: C.amberInk },
  glass: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder, borderStyle: 'solid' },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, letterSpacing: 1.3, textTransform: 'uppercase', color: C.amberInk },
  hero: { flexDirection: 'row', borderRadius: R.lg, padding: 16 },
  heroRight: { flex: 1, marginLeft: 16, justifyContent: 'space-between' },
  title: { fontFamily: 'Unbounded', fontWeight: 800, fontSize: 22, lineHeight: 1.08, letterSpacing: -0.7, textTransform: 'uppercase', color: C.ink, marginTop: 6 },
  when: { fontFamily: 'Inter', fontWeight: 700, fontSize: 12.5, marginTop: 12 },
  where: { fontFamily: 'Inter', fontWeight: 600, fontSize: 11, marginTop: 8 },
  addr: { fontFamily: 'Inter', fontWeight: 400, fontSize: 9.5, color: C.gray, marginTop: 1 },
  pill: { alignSelf: 'flex-start', backgroundColor: C.amber, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12, marginTop: 12 },
  pillText: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9, letterSpacing: 0.9, textTransform: 'uppercase', color: C.ink },
  row: { flexDirection: 'row', marginTop: 16 },
  qrCard: { width: 244, borderRadius: R.lg, padding: 16, alignItems: 'center' },
  qrBox: { backgroundColor: '#FFFFFF', borderRadius: R.md, borderWidth: 1, borderColor: C.glassBorder, borderStyle: 'solid', padding: 8 },
  qr: { width: 200, height: 200 },
  ref: { fontFamily: 'Inter', fontWeight: 700, fontSize: 18, letterSpacing: 2.4, marginTop: 12 },
  qrNote: { fontFamily: 'Inter', fontWeight: 400, fontSize: 8.6, color: C.gray, textAlign: 'center', marginTop: 6, lineHeight: 1.5 },
  details: { flex: 1, marginLeft: 16, borderRadius: R.lg, padding: 18, justifyContent: 'space-between' },
  field: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line, borderBottomStyle: 'solid' },
  fieldLast: { paddingVertical: 7 },
  value: { fontFamily: 'Inter', fontWeight: 700, fontSize: 12.5, marginTop: 2 },
  valueBig: { fontFamily: 'Unbounded', fontWeight: 800, fontSize: 13, letterSpacing: -0.3, textTransform: 'uppercase', marginTop: 3 },
  org: { borderRadius: R.md, padding: 13, marginTop: 16 },
  orgName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 10.5, marginTop: 3 },
  orgLine: { fontFamily: 'Inter', fontWeight: 400, fontSize: 9, color: C.gray },
  foot: { marginTop: 14, fontFamily: 'Inter', fontWeight: 400, fontSize: 7.6, color: C.grayDim, lineHeight: 1.45 },
  footStrong: { fontFamily: 'Inter', fontWeight: 600, color: C.gray },
  stamp: { position: 'absolute', top: 330, left: 90, width: 420, transform: 'rotate(-14deg)', borderWidth: 4, borderColor: C.coral, borderStyle: 'solid', borderRadius: 14, paddingVertical: 8, backgroundColor: 'rgba(255,248,238,0.9)' },
  stampText: { fontFamily: 'Unbounded', fontWeight: 800, fontSize: 38, letterSpacing: -1, color: C.coral, textAlign: 'center', textTransform: 'uppercase' },
});

const TZ = 'America/Guadeloupe';
function cap(x: string) { return x.charAt(0).toUpperCase() + x.slice(1); }
function dateLong(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return cap(new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(t)));
}
function timeShort(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
  return `${p.find((x) => x.type === 'hour')?.value ?? '00'}h${p.find((x) => x.type === 'minute')?.value ?? '00'}`;
}
const siret = (v: string) => v.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');
const TODO = '[À COMPLÉTER]';

/** Ligne(s) légales de l'organisateur : structure + SIRET, sinon nom et prénom du responsable, sinon [À COMPLÉTER]. */
export function organizerLines(o: TicketPageData['organizer']): { name: string; id: string; extra: string } {
  const name = o.name ? (o.legalForm ? `${o.name} · ${o.legalForm}` : o.name) : `${TODO} nom de la structure`;
  const id = o.siret ? `SIRET ${siret(o.siret)}` : o.responsible ? `Responsable : ${o.responsible}` : `${TODO} SIRET, ou nom et prénom du responsable`;
  const extra = [o.address, o.contactEmail].filter(Boolean).join(' · ');
  return { name, id, extra };
}

function Background() {
  return (
    <View style={s.bg} fixed>
    <Svg width={595.28} height={841.89}>
      <Defs>
        <RadialGradient id="a" cx="88%" cy="6%" r="55%"><Stop offset="0%" stopColor={C.amber} stopOpacity={0.55} /><Stop offset="100%" stopColor={C.amber} stopOpacity={0} /></RadialGradient>
        <RadialGradient id="c" cx="4%" cy="34%" r="45%"><Stop offset="0%" stopColor={C.coral} stopOpacity={0.30} /><Stop offset="100%" stopColor={C.coral} stopOpacity={0} /></RadialGradient>
        <RadialGradient id="b" cx="92%" cy="100%" r="50%"><Stop offset="0%" stopColor={C.amber} stopOpacity={0.35} /><Stop offset="100%" stopColor={C.amber} stopOpacity={0} /></RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="595.28" height="841.89" fill="url(#a)" />
      <Rect x="0" y="0" width="595.28" height="841.89" fill="url(#c)" />
      <Rect x="0" y="0" width="595.28" height="841.89" fill="url(#b)" />
    </Svg>
    </View>
  );
}

/** Zone visuelle quand l'événement n'a pas de flyer : aplat dégradé ambre → corail aux couleurs du site. */
function NoFlyer({ title }: { title: string }) {
  return (
    <View style={{ width: 190, height: 224, borderRadius: R.sm, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: 190, height: 224 }}>
        <Svg width={190} height={224}>
          <Defs><LinearGradient id="g" x1="0" y1="0" x2="1" y2="1"><Stop offset="0%" stopColor={C.amber} /><Stop offset="100%" stopColor={C.coral} /></LinearGradient></Defs>
          <Rect x="0" y="0" width="190" height="224" fill="url(#g)" />
        </Svg>
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 14 }}>
        <Text style={{ fontFamily: 'Caveat', fontWeight: 700, fontSize: 18, color: '#FFFFFF' }}>La Sunshines</Text>
        <Text style={{ fontFamily: 'Unbounded', fontWeight: 800, fontSize: 14, lineHeight: 1.1, letterSpacing: -0.4, color: C.ink, textTransform: 'uppercase', marginTop: 4 }}>{title}</Text>
      </View>
    </View>
  );
}

export interface RenderedTicket extends TicketPageData {
  qr: Buffer;
  logo: Buffer;
}

function TicketPage({ t }: { t: RenderedTicket }) {
  const cancelled = t.status !== 'valid' && t.status !== 'used';
  const org = organizerLines(t.organizer);
  const fh = t.flyer ? Math.min(240, Math.round((190 * t.flyer.height) / t.flyer.width)) : 224;
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <Background />
      <View style={s.header}>
        <Image src={{ data: t.logo, format: 'png' }} style={s.logo} />
        <Text style={s.script}>Ta soirée t’attend</Text>
      </View>

      <View style={[s.glass, s.hero]}>
        {t.flyer ? (
          <Image src={{ data: t.flyer.data, format: 'jpg' }} style={{ width: 190, height: fh, borderRadius: R.sm }} />
        ) : (
          <NoFlyer title={t.eventTitle} />
        )}
        <View style={s.heroRight}>
          <View>
            <Text style={s.kicker}>Billet nominatif</Text>
            <Text style={s.title}>{t.eventTitle}</Text>
            <Text style={s.when}>{dateLong(t.startsAt)} · {timeShort(t.startsAt)}</Text>
            <Text style={s.where}>{t.venueName || '—'}</Text>
            {t.venueAddress ? <Text style={s.addr}>{t.venueAddress}</Text> : null}
          </View>
          <View style={s.pill}><Text style={s.pillText}>{t.tierName}</Text></View>
        </View>
      </View>

      <View style={s.row}>
        <View style={[s.glass, s.qrCard]}>
          <View style={s.qrBox}><Image src={{ data: t.qr, format: 'png' }} style={s.qr} /></View>
          <Text style={s.ref}>{t.reference}</Text>
          <Text style={s.qrNote}>Présente ce QR code à l’entrée.{'\n'}Un billet = une entrée.</Text>
        </View>
        <View style={[s.glass, s.details]}>
          <View style={s.field}><Text style={s.kicker}>Titulaire</Text><Text style={s.valueBig}>{t.holder || '—'}</Text></View>
          <View style={s.field}><Text style={s.kicker}>Tarif</Text><Text style={s.value}>{t.tierName}</Text></View>
          <View style={s.field}><Text style={s.kicker}>{t.priceCents === 0 ? 'Prix' : 'Prix payé'}</Text><Text style={s.value}>{formatPrice(t.priceCents)}</Text></View>
          <View style={s.fieldLast}><Text style={s.kicker}>Commande</Text><Text style={s.value}>{t.orderNumber}</Text></View>
        </View>
      </View>

      <View style={[s.glass, s.org]}>
        <Text style={s.kicker}>Organisateur</Text>
        <Text style={s.orgName}>{org.name}</Text>
        <Text style={s.orgLine}>{org.id}</Text>
        {org.extra ? <Text style={s.orgLine}>{org.extra}</Text> : null}
      </View>

      <Text style={s.foot}>
        <Text style={s.footStrong}>TVA non applicable, art. 293 B du CGI.</Text> Billet nominatif, un billet = une entrée.
        Présente le QR code à l’entrée, sur ton téléphone ou imprimé, et ne le partage pas : seul le premier scan est valable.
        Une pièce d’identité peut être demandée. Conditions de vente : /cgv · Règlement : /interdits.
      </Text>

      {cancelled ? <View style={s.stamp}><Text style={s.stampText}>Annulé</Text></View> : null}
    </Page>
  );
}

export function TicketsDocument({ tickets, title }: { tickets: RenderedTicket[]; title: string }) {
  return (
    <Document title={title} author="La Sunshines" subject="Billet" creator="La Sunshines" producer="La Sunshines">
      {tickets.map((t) => <TicketPage key={t.ticketId} t={t} />)}
    </Document>
  );
}
