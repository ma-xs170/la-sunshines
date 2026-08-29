'use client';

import { useEffect, useState } from 'react';

type State = 'ok' | 'slow' | 'down';
type Service = { id: string; label: string; state: State; ms: number | null };
type Payload = { checkedAt: string; overall: State; services: Service[] };

const LABEL: Record<State, string> = {
  ok: 'Opérationnel',
  slow: 'Ralenti',
  down: 'Indisponible',
};

export default function StatusWidget() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as Payload;
        if (alive) {
          setData(json);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const overall: State = failed ? 'down' : (data?.overall ?? 'ok');
  const services: Service[] = data?.services ?? [
    { id: 'site', label: 'Site LA SUNSHINES', state: 'ok', ms: 0 },
  ];

  return (
    <section className="status glass" aria-label="État des services">
      <header className="status__head">
        <span className={`status__dot status__dot--${overall}`} aria-hidden="true" />
        <span className="status__title">État des services</span>
        <span className="status__overall">{LABEL[overall]}</span>
      </header>
      <ul className="status__list">
        {services.map((s) => {
          const state: State = failed ? 'down' : s.state;
          return (
            <li className="status__row" key={s.id}>
              <span
                className={`status__dot status__dot--${state}`}
                aria-hidden="true"
              />
              <span className="status__name">{s.label}</span>
              <span className="status__state" data-state={state}>
                {LABEL[state]}
                {s.ms != null && s.id !== 'site' && !failed ? (
                  <span className="status__ms"> · {s.ms} ms</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="status__foot">
        {failed
          ? 'Vérification impossible pour le moment.'
          : `Vérifié ${
              data
                ? new Date(data.checkedAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '…'
            } · auto toutes les 60 s`}
      </p>
    </section>
  );
}
