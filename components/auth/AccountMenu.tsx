'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseConfigured } from '@/lib/supabase/config';
import { useAuthUser } from './useAuthUser';
import LogoutButton from './LogoutButton';

/** Menu compte du header — version bureau (masquée sous 820px, voir globals.css). */
export function AccountMenu() {
  const { ready, user } = useAuthUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  if (!supabaseConfigured() || !ready) return null;

  if (!user) {
    return (
      <a className="acct acct__login" href="/connexion">
        Connexion
      </a>
    );
  }

  const initial = (user.firstName || user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="acct" ref={ref}>
      <button
        type="button"
        className="acct__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mon compte"
        onClick={() => setOpen((v) => !v)}
      >
        {initial}
      </button>
      {open && (
        <div className="acct__menu" role="menu">
          <p className="acct__who">{user.firstName || user.email}</p>
          <a role="menuitem" href="/compte/billets">Mes billets</a>
          {user.isOrganizer && <a role="menuitem" href="/organisateur">Organisateur</a>}
          <a role="menuitem" href="/compte">Mon compte</a>
          <LogoutButton className="acct__out" />
        </div>
      )}
    </div>
  );
}

/** Liens compte dans le menu déroulant mobile (visibles sous 820px seulement). */
export function AccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { ready, user } = useAuthUser();
  if (!supabaseConfigured() || !ready) return null;

  return (
    <div className="acct-links">
      {user ? (
        <>
          <a className="link" href="/compte/billets" onClick={onNavigate}>Mes billets</a>
          {user.isOrganizer && <a className="link" href="/organisateur" onClick={onNavigate}>Organisateur</a>}
          <a className="link" href="/compte" onClick={onNavigate}>Mon compte</a>
          <LogoutButton className="link acct-links__out" />
        </>
      ) : (
        <a className="link" href="/connexion" onClick={onNavigate}>Connexion</a>
      )}
    </div>
  );
}
