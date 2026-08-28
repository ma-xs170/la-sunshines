'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

type Msg = { role: 'user' | 'assistant'; content: string };

const MAX_TURNS = 24;
const GREETING: Msg = {
  role: 'assistant',
  content:
    'Salut 👋 Je suis l’assistant LA SUNSHINES. Je peux te renseigner sur les éditions, la billetterie, les infos pratiques et le règlement. Comment je peux t’aider ?',
};

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; fallback?: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const turns = msgs.filter((m) => m.role === 'user').length;
  const reachedLimit = msgs.length >= MAX_TURNS;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // auto-scroll vers le bas à chaque nouveau message / état (robuste : rAF + set direct)
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    toBottom();
    const r = requestAnimationFrame(toBottom);
    return () => cancelAnimationFrame(r);
  }, [msgs, busy, err]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || busy || reachedLimit) return;
    const next = [...msgs, { role: 'user' as const, content: text }];
    setMsgs(next);
    setInput('');
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.filter((m, i) => !(i === 0 && m === GREETING)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr({ text: data.error ?? 'Une erreur est survenue.', fallback: data.fallback });
        return;
      }
      setMsgs((m) => [...m, { role: 'assistant', content: String(data.reply ?? '') }]);
    } catch {
      setErr({ text: 'Connexion impossible. Réessaie dans un instant.', fallback: '/contact' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="asst-fab"
        type="button"
        aria-label={open ? 'Fermer l’assistant' : 'Ouvrir l’assistant'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'close' : 'sparkles'} />
      </button>

      {open && (
        <div className="asst-panel glass" role="dialog" aria-label="Assistant LA SUNSHINES">
          <header className="asst-head">
            <span className="asst-head__title">
              <Icon name="sparkles" className="icon" />
              Assistant
            </span>
            <button
              className="asst-head__close"
              type="button"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </header>

          <div className="asst-body" ref={bodyRef}>
            {msgs.map((m, i) => (
              <p
                key={i}
                className={m.role === 'user' ? 'asst-msg asst-msg--me' : 'asst-msg'}
              >
                {m.content}
              </p>
            ))}
            {busy && <p className="asst-msg asst-msg--typing">…</p>}
            {err && (
              <p className="asst-msg asst-msg--err">
                {err.text}{' '}
                {err.fallback && (
                  <a href={err.fallback}>Ouvrir&nbsp;{err.fallback}</a>
                )}
              </p>
            )}
          </div>

          <form
            className="asst-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              disabled={busy || reachedLimit}
              placeholder={
                reachedLimit
                  ? 'Limite atteinte — recharge la page'
                  : 'Ta question…'
              }
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="submit"
              aria-label="Envoyer"
              disabled={busy || reachedLimit || !input.trim()}
            >
              <Icon name="arrow-right" />
            </button>
          </form>

          <p className="asst-foot">
            Réponses indicatives · {turns}/{Math.floor(MAX_TURNS / 2)} messages ·
            besoin d’un humain ? <a href="/contact">Contact</a>
          </p>
        </div>
      )}
    </>
  );
}
