'use client';

import { useState } from 'react';
import Icon from './Icon';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY = { name: '', email: '', subject: '', message: '', company: '' };

export default function ContactForm() {
  const [form, setForm] = useState({ ...EMPTY });
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function clientInvalid(): string | null {
    if (!form.name.trim()) return 'Indique ton nom.';
    if (!EMAIL_RE.test(form.email.trim())) return 'Indique une adresse email valide.';
    if (!form.subject.trim()) return 'Indique un sujet.';
    if (!form.message.trim()) return 'Écris ton message.';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = clientInvalid();
    if (problem) {
      setStatus('error');
      setError(problem);
      return;
    }
    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus('sent');
        setForm({ ...EMPTY });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setStatus('error');
      setError(data.error ?? 'L’envoi a échoué. Réessaie plus tard.');
    } catch {
      setStatus('error');
      setError('Impossible d’envoyer le message. Vérifie ta connexion.');
    }
  }

  if (status === 'sent') {
    return (
      <div className="contact-form glass contact-form--done" role="status">
        <span className="contact-form__check">
          <Icon name="sparkles" />
        </span>
        <h2>Message envoyé</h2>
        <p>Merci ! On te répond au plus vite à l’adresse indiquée.</p>
        <button
          type="button"
          className="btn btn--outline"
          onClick={() => setStatus('idle')}
        >
          Envoyer un autre message
        </button>
      </div>
    );
  }

  return (
    <form className="contact-form glass" onSubmit={submit} noValidate>
      <div className="contact-field">
        <label htmlFor="cf-name">Nom</label>
        <input
          id="cf-name"
          value={form.name}
          onChange={set('name')}
          autoComplete="name"
          required
        />
      </div>

      <div className="contact-field">
        <label htmlFor="cf-email">Email</label>
        <input
          id="cf-email"
          type="email"
          value={form.email}
          onChange={set('email')}
          autoComplete="email"
          required
        />
      </div>

      <div className="contact-field">
        <label htmlFor="cf-subject">Sujet</label>
        <input
          id="cf-subject"
          value={form.subject}
          onChange={set('subject')}
          required
        />
      </div>

      <div className="contact-field">
        <label htmlFor="cf-message">Message</label>
        <textarea
          id="cf-message"
          rows={6}
          value={form.message}
          onChange={set('message')}
          required
        />
      </div>

      {/* honeypot anti-spam — caché aux humains */}
      <div className="contact-hp" aria-hidden="true">
        <label htmlFor="cf-company">Société</label>
        <input
          id="cf-company"
          tabIndex={-1}
          autoComplete="off"
          value={form.company}
          onChange={set('company')}
        />
      </div>

      {status === 'error' && <p className="contact-form__error">{error}</p>}

      <button className="btn btn--amber" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Envoi…' : 'Envoyer'}
      </button>
    </form>
  );
}
