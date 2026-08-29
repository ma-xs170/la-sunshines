import type { ReactNode } from 'react';
import Link from 'next/link';

// Rendu Markdown MINIMAL pour les réponses de l'assistant (Mistral) :
// **gras**, [texte](url) (lien interne → <Link> Next, externe → nouvel onglet),
// listes à tirets, sauts de ligne. Volontairement limité — pas de dépendance.

const INLINE_RE =
  /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|`([^`\n]+)`/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const label = m[1];
      const url = m[2];
      const internal = url.startsWith('/') && !url.startsWith('//');
      nodes.push(
        internal ? (
          <Link key={`${keyBase}-a${i}`} href={url} className="asst-link">
            {label}
          </Link>
        ) : (
          <a
            key={`${keyBase}-a${i}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="asst-link"
          >
            {label}
          </a>
        ),
      );
    } else if (m[3] !== undefined || m[4] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[3] ?? m[4]}</strong>);
    } else if (m[5] !== undefined) {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[5]}</em>);
    } else {
      nodes.push(<code key={`${keyBase}-c${i}`}>{m[6]}</code>);
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let k = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    listBuffer = [];
    const idx = k++;
    blocks.push(
      <ul className="md-list" key={`ul${idx}`}>
        {items.map((it, j) => (
          <li key={j}>{renderInline(it, `ul${idx}-${j}`)}</li>
        ))}
      </ul>,
    );
  };

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*]\s+(.+)$/);
    if (li) {
      listBuffer.push(li[1]);
      continue;
    }
    flushList();
    if (line.trim() === '') {
      blocks.push(<span className="md-gap" key={`g${k++}`} />);
      continue;
    }
    const idx = k++;
    blocks.push(
      <p className="md-p" key={`p${idx}`}>
        {renderInline(line, `p${idx}`)}
      </p>,
    );
  }
  flushList();

  return <>{blocks}</>;
}
