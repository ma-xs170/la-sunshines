'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import Icon from '../Icon';
import BackFooter from '../BackFooter';
import LogoutButton from '../auth/LogoutButton';
import GlobalSearch from './GlobalSearch';
import { activeAdminGroup, adminCrumbs, adminMenu, isAdminActive, visibleAdminMenu } from '@/lib/admin/menu';

/** Cadre de l'espace admin : MÊMES classes et même disposition que l'espace organisateur (menu latéral plat pleine hauteur, en-tête, pied de page). */
export default function AdminShell({ firstName, reference, isSuper, pending, support, children }: { firstName: string; reference: string | null; isSuper: boolean; pending: number; support: number; children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const groups = useMemo(() => visibleAdminMenu(adminMenu(), isSuper), [isSuper]);
  const activeGroup = activeAdminGroup(groups, pathname, params);
  const [openId, setOpenId] = useState<string | null>(activeGroup);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpenId(activeGroup); setDrawer(false); setMenu(false); }, [activeGroup, pathname]);
  useEffect(() => {
    if (!menu && !drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setDrawer(false); } };
    const onClick = (e: MouseEvent) => { if (menu && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('keydown', onKey); document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, [menu, drawer]);
  useEffect(() => { document.body.classList.toggle('is-scroll-locked', drawer); return () => document.body.classList.remove('is-scroll-locked'); }, [drawer]);

  // Le scan à l'entrée reste plein écran (téléphone du staff), sans cadre.
  if (pathname.startsWith('/admin/scan')) return <>{children}</>;

  const count = (b?: 'support' | 'pending') => (b === 'support' ? support : b === 'pending' ? pending : 0);
  const Badge = ({ b }: { b?: 'support' | 'pending' }) => count(b) > 0 ? <b className="oside__badge" aria-label={`${count(b)} à traiter`}>{count(b) > 9 ? '9+' : count(b)}</b> : null;
  const trail = adminCrumbs(pathname);

  return (
    <div className="oshell oshell--admin">
      <a className="oshell__skip" href="#org-main">Aller au contenu</a>
      {drawer && <button type="button" className="oshell__scrim" aria-label="Fermer le menu" onClick={() => setDrawer(false)} />}

      <aside className={'oside' + (drawer ? ' is-open' : '')} id="oside" aria-label="Menu de l’administration">
        <a className="oside__brand" href="/admin" aria-label="LA SUNSHINES, administration">
          <Image className="oside__logo" src="/images/logo-dark.png" alt="LA SUNSHINES" width={848} height={168} priority />
          <span className="oside__tag script" aria-hidden="true">administration</span>
        </a>
        <nav className="oside__nav" aria-label="Menu de l’administration">
          <ul>
            {groups.map((g) => {
              const single = g.items.length === 1 && g.items[0].label === g.label;
              const open = openId === g.id;
              if (single) {
                const leaf = g.items[0]; const active = isAdminActive(leaf.href, pathname, params);
                return (
                  <li key={g.id} className="oside__group">
                    <a href={leaf.href} className={'oside__head oside__head--link' + (active ? ' is-active' : '')} aria-current={active ? 'page' : undefined}>
                      <Icon name={g.icon} className="icon oside__ico" /><span>{g.label}</span><Badge b={leaf.badge} />
                    </a>
                  </li>
                );
              }
              return (
                <li key={g.id} className={'oside__group' + (open ? ' is-open' : '') + (activeGroup === g.id ? ' has-active' : '')}>
                  <button type="button" className="oside__head" aria-expanded={open} aria-controls={`sec-${g.id}`} onClick={() => setOpenId(open ? null : g.id)}>
                    <Icon name={g.icon} className="icon oside__ico" /><span>{g.label}</span><Icon name="chevron-down" className="icon oside__chev" />
                  </button>
                  {open && (
                    <ul className="oside__sub" id={`sec-${g.id}`}>
                      {g.items.map((leaf) => {
                        const active = isAdminActive(leaf.href, pathname, params);
                        return <li key={leaf.href}><a href={leaf.href} className={'oside__leaf' + (active ? ' is-active' : '')} aria-current={active ? 'page' : undefined}>{leaf.label}<Badge b={leaf.badge} /></a></li>;
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="oshell__col">
        <header className="otop">
          <button type="button" className="otop__burger" aria-expanded={drawer} aria-controls="oside" aria-label={drawer ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setDrawer((v) => !v)}><Icon name="menu" /></button>
          <nav className="otop__crumbs" aria-label="Fil d’Ariane">
            <ol>{trail.map((c, i) => <li key={i}>{c.href ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}</li>)}</ol>
          </nav>
          <GlobalSearch />
          <div className="otop__org" ref={menuRef}>
            <button type="button" className="otop__orgbtn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <span className="otop__avatar" aria-hidden="true">{(firstName || 'A').charAt(0).toUpperCase()}</span>
              <span className="otop__orgname">{firstName || 'Admin'}</span>
              <Icon name="chevron-down" className="icon otop__chev" />
            </button>
            {menu && (
              <div className="otop__menu" role="menu">
                <p className="otop__who">{isSuper ? 'Super-administrateur' : 'Administrateur'}{reference ? ` · ${reference}` : ''}</p>
                <a role="menuitem" href="/compte">Mon compte</a>
                <a role="menuitem" href="/admin/gestion/reglages">Réglages</a>
                <a role="menuitem" href="/">Retour au site</a>
                <LogoutButton className="otop__out" />
              </div>
            )}
          </div>
        </header>
        <div className="oshell__main" id="org-main" tabIndex={-1}>{children}</div>
        <BackFooter />
      </div>
    </div>
  );
}
