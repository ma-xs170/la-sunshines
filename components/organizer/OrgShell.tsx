'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import Icon from '../Icon';
import BackFooter from '../BackFooter';
import LogoutButton from '../auth/LogoutButton';
import { accountMenu, activeGroupId, crumbs, eventMenu, eventSlugOf, isActiveHref, visibleMenu, type MenuGroup } from '@/lib/organizer/menu';
import { can, ROLE_LABEL, type OrgRole } from '@/lib/organizer/roles';

export interface ShellOrg { id: string; name: string; role: OrgRole; reference: string | null; status: 'pending' | 'approved' | 'suspended' }

const STATUS_NOTE: Record<'pending' | 'suspended', string> = {
  pending: 'Ton organisation est en attente d’approbation par l’équipe LA SUNSHINES. Tu peux préparer tes évènements ; rien n’est public tant qu’elle n’est pas approuvée.',
  suspended: 'Cette organisation est suspendue : les ventes et publications sont bloquées. Contacte l’équipe pour en savoir plus.',
};

/** Copie la référence ORG. L'annonce « copiée » passe par une zone aria-live pour les lecteurs d'écran. */
function CopyRef({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1800); } catch { /* presse-papiers indisponible : la référence reste lisible et sélectionnable */ }
  };
  return (
    <span className="otop__ref">
      <span className="otop__reflabel">Référence</span>
      <code className="otop__refcode">{value}</code>
      <button type="button" className="otop__copy" onClick={copy} aria-label={`Copier la référence ${value}`}>{done ? 'Copiée' : 'Copier'}</button>
      <span className="sr-only" role="status">{done ? 'Référence copiée' : ''}</span>
    </span>
  );
}

function Leaf({ leaf, active, unread }: { leaf: MenuGroup['items'][number]; active: boolean; unread: number }) {
  if (!leaf.href) {
    return <li><span className="oside__leaf oside__leaf--soon" aria-disabled="true">{leaf.label}<em className="oside__soon">Bientôt</em></span></li>;
  }
  return (
    <li>
      <a href={leaf.href} className={'oside__leaf' + (active ? ' is-active' : '')} aria-current={active ? 'page' : undefined}>
        {leaf.label}
        {leaf.badge === 'news' && unread > 0 && <b className="oside__badge" aria-label={`${unread} non lue${unread > 1 ? 's' : ''}`}>{unread > 9 ? '9+' : unread}</b>}
      </a>
    </li>
  );
}

/** Cadre de l'espace organisateur : menu latéral à deux contextes (compte / évènement), en-tête avec la référence ORG, pied de page. */
export default function OrgShell({ orgs, currentId, unread, firstName, children }: { orgs: ShellOrg[]; currentId: string; unread: number; firstName: string; children: ReactNode }) {
  const pathname = usePathname();
  const onglet = useSearchParams().get('onglet');
  const current = orgs.find((o) => o.id === currentId) ?? orgs[0];
  const slug = eventSlugOf(pathname);
  const groups = useMemo(() => visibleMenu(slug ? eventMenu(slug) : accountMenu(), (c) => can(current?.role, c)), [slug, current?.role]);
  const activeGroup = activeGroupId(groups, pathname, onglet);

  // une seule section ouverte à la fois ; elle suit l'entrée active quand on navigue
  const [openId, setOpenId] = useState<string | null>(activeGroup);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpenId(activeGroup); setDrawer(false); setMenu(false); }, [activeGroup, pathname, slug]);
  useEffect(() => {
    if (!menu && !drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setDrawer(false); } };
    const onClick = (e: MouseEvent) => { if (menu && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('keydown', onKey); document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, [menu, drawer]);
  useEffect(() => { document.body.classList.toggle('is-scroll-locked', drawer); return () => document.body.classList.remove('is-scroll-locked'); }, [drawer]);

  if (!current) return <>{children}</>;
  const trail = crumbs(pathname);
  const note = current.status === 'approved' ? null : STATUS_NOTE[current.status];

  return (
    <div className="oshell">
      <a className="oshell__skip" href="#org-main">Aller au contenu</a>
      {drawer && <button type="button" className="oshell__scrim" aria-label="Fermer le menu" onClick={() => setDrawer(false)} />}

      <aside className={'oside' + (drawer ? ' is-open' : '')} id="oside" aria-label="Menu de l’espace organisateur">
        <a className="oside__brand" href="/organisateur" aria-label="LA SUNSHINES, espace organisateur">
          <Image className="oside__logo" src="/images/logo-dark.png" alt="LA SUNSHINES" width={848} height={168} priority />
          <span className="oside__tag script" aria-hidden="true">organisateur</span>
        </a>

        {slug && <a className="oside__back" href="/organisateur/evenements"><Icon name="chevron-left" />Retour à la liste des évènements</a>}

        <nav className="oside__nav" aria-label={slug ? 'Menu de l’évènement' : 'Menu du compte'}>
          <ul>
            {groups.map((g) => {
              const single = g.items.length === 1 && g.items[0].label === g.label;   // rubrique sans sous-menu : lien direct
              const open = openId === g.id;
              if (single) {
                const leaf = g.items[0];
                const active = isActiveHref(leaf.href, pathname, onglet);
                return (
                  <li key={g.id} className="oside__group">
                    {leaf.href
                      ? <a href={leaf.href} className={'oside__head oside__head--link' + (active ? ' is-active' : '')} aria-current={active ? 'page' : undefined}>
                          <Icon name={g.icon} className="icon oside__ico" /><span>{g.label}</span>
                          {leaf.badge === 'news' && unread > 0 && <b className="oside__badge" aria-label={`${unread} non lue${unread > 1 ? 's' : ''}`}>{unread > 9 ? '9+' : unread}</b>}
                        </a>
                      : <span className="oside__head oside__head--soon" aria-disabled="true"><Icon name={g.icon} className="icon oside__ico" /><span>{g.label}</span><em className="oside__soon">Bientôt</em></span>}
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
                      {g.items.map((leaf, idx) => (
                        <FragmentLeaf key={leaf.label} leaf={leaf} subtitle={g.sub && g.sub.after === idx ? g.sub.label : null} active={isActiveHref(leaf.href, pathname, onglet)} unread={unread} />
                      ))}
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
          <button type="button" className="otop__burger" aria-expanded={drawer} aria-controls="oside" aria-label={drawer ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setDrawer((v) => !v)}>
            <Icon name="menu" />
          </button>
          <nav className="otop__crumbs" aria-label="Fil d’Ariane">
            <ol>{trail.map((c, i) => <li key={i}>{c.href ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}</li>)}</ol>
          </nav>
          {current.reference && <CopyRef value={current.reference} />}
          <div className="otop__org" ref={menuRef}>
            <button type="button" className="otop__orgbtn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <span className="otop__avatar" aria-hidden="true">{current.name.trim().charAt(0).toUpperCase()}</span>
              <span className="otop__orgname">{current.name}</span>
              <Icon name="chevron-down" className="icon otop__chev" />
            </button>
            {menu && (
              <div className="otop__menu" role="menu">
                <p className="otop__who">{firstName || 'Mon compte'} · {ROLE_LABEL[current.role]}</p>
                {orgs.length > 1 && (
                  <div className="otop__orgs" role="group" aria-label="Changer d’organisation">
                    {orgs.map((o) => (
                      <form key={o.id} method="post" action="/api/organisateur/org">
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="next" value={pathname} />
                        <button role="menuitemradio" aria-checked={o.id === current.id} className={o.id === current.id ? 'is-current' : ''}>{o.name}</button>
                      </form>
                    ))}
                  </div>
                )}
                {can(current.role, 'owner') && <a role="menuitem" href="/organisateur/parametres">Informations légales</a>}
                <a role="menuitem" href="/compte">Mon compte</a>
                <a role="menuitem" href="/">Retour au site</a>
                <LogoutButton className="otop__out" />
              </div>
            )}
          </div>
        </header>

        {note && <p className={'oshell__note oshell__note--' + current.status} role="status">{note}</p>}
        <div className="oshell__main" id="org-main" tabIndex={-1}>{children}</div>

        {can(current.role, 'manage') && !pathname.startsWith('/organisateur/support') && (
          <a className="sup-help" href={`/organisateur/support/nouveau?page=${encodeURIComponent(pathname)}`}><Icon name="help" />Aide</a>
        )}
        <BackFooter />
      </div>
    </div>
  );
}

/** Une entrée du sous-menu, précédée si besoin d'un sous-titre de section (ex. « Distribuer »). */
function FragmentLeaf({ leaf, subtitle, active, unread }: { leaf: MenuGroup['items'][number]; subtitle: string | null; active: boolean; unread: number }) {
  return (
    <>
      {subtitle && <li className="oside__subtitle" role="presentation">{subtitle}</li>}
      <Leaf leaf={leaf} active={active} unread={unread} />
    </>
  );
}
