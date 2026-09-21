'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import Icon from '../Icon';
import LogoutButton from '../auth/LogoutButton';
import { activeNav, navFor, ROLE_LABEL, can, type OrgRole } from '@/lib/organizer/roles';

export interface TopbarOrg { id: string; name: string; role: OrgRole }

/** Barre du haut de l'espace organisateur : rubriques à gauche ; Actualités (cloche + non lus), Aide et organisation à droite. Burger sur mobile. */
export default function OrgTopbar({ orgs, currentId, unread, firstName }: { orgs: TopbarOrg[]; currentId: string; unread: number; firstName: string }) {
  const pathname = usePathname();
  const current = orgs.find((o) => o.id === currentId) ?? orgs[0];
  const items = navFor(current?.role);
  const active = activeNav(pathname);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); setMenu(false); }, [pathname]);
  useEffect(() => {
    if (!open && !menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setMenu(false); } };
    const onClick = (e: MouseEvent) => { if (bar.current && !bar.current.contains(e.target as Node)) { setOpen(false); setMenu(false); } };
    document.addEventListener('keydown', onKey); document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, [open, menu]);

  if (!current) return null;
  const badge = unread > 9 ? '9+' : String(unread);

  return (
    <header className="obar-wrap">
      <div className={'obar' + (open ? ' is-open' : '')} ref={bar}>
        <a className="obar__brand" href="/organisateur" aria-label="LA SUNSHINES — espace organisateur">
          <Image className="obar__logo" src="/images/logo-dark.png" alt="LA SUNSHINES" width={848} height={168} priority />
          <span className="obar__tag script" aria-hidden="true">organisateur</span>
        </a>

        <div className="obar__panel" id="obar-panel" role="navigation" aria-label="Espace organisateur">
          <div className="obar__links">
            {items.map((i) => (
              <a key={i.href} href={i.href} className={'obar__link' + (i.href === active ? ' is-active' : '')} aria-current={i.href === active ? 'page' : undefined}>{i.label}</a>
            ))}
          </div>
          <div className="obar__tools">
            <a className={'obar__link obar__link--tool' + (pathname.startsWith('/organisateur/actualites') ? ' is-active' : '')} href="/organisateur/actualites">
              <span className="obar__bell"><Icon name="bell" />{unread > 0 && <b className="obar__badge" aria-hidden="true">{badge}</b>}</span>
              Actualités{unread > 0 && <span className="sr-only"> ({unread} non lue{unread > 1 ? 's' : ''})</span>}
            </a>
            <a className={'obar__link obar__link--tool' + (pathname.startsWith('/organisateur/aide') ? ' is-active' : '')} href="/organisateur/aide"><Icon name="help" />Aide</a>
          </div>
        </div>

        {/* la cloche reste visible sur mobile, hors du menu burger */}
        <a className="obar__bell-mobile" href="/organisateur/actualites" aria-label={unread > 0 ? `Actualités, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Actualités'}>
          <Icon name="bell" />{unread > 0 && <b className="obar__badge" aria-hidden="true">{badge}</b>}
        </a>

        <div className="obar__org">
          <button type="button" className="obar__orgbtn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <span className="obar__avatar" aria-hidden="true">{current.name.trim().charAt(0).toUpperCase()}</span>
            <span className="obar__orgname">{current.name}</span>
            <Icon name="chevron-down" className="icon obar__chev" />
          </button>
          {menu && (
            <div className="obar__menu" role="menu">
              <p className="obar__who">{firstName || 'Mon compte'} · {ROLE_LABEL[current.role]}</p>
              {orgs.length > 1 && (
                <div className="obar__orgs" role="group" aria-label="Changer d’organisation">
                  {orgs.map((o) => (
                    <form key={o.id} method="post" action="/api/organisateur/org">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="next" value={pathname} />
                      <button role="menuitemradio" aria-checked={o.id === current.id} className={o.id === current.id ? 'is-current' : ''}>{o.name}</button>
                    </form>
                  ))}
                </div>
              )}
              {can(current.role, 'owner') && <a role="menuitem" href="/organisateur/parametres">Paramètres de l’organisation</a>}
              <a role="menuitem" href="/compte">Mon compte</a>
              <a role="menuitem" href="/">Retour au site</a>
              <LogoutButton className="obar__out" />
            </div>
          )}
        </div>

        <button type="button" className="obar__burger" aria-expanded={open} aria-controls="obar-panel" aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setOpen((v) => !v)}>
          <Icon name="menu" className="icon icon--menu" /><Icon name="close" className="icon icon--close" />
        </button>
      </div>
    </header>
  );
}
