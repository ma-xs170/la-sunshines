import Icon from '../Icon';
import type { NewsItem } from '@/lib/organizer/news';
import { NEWS_CATEGORIES } from '@/lib/news/text';

/** Publications épinglées : bandeau en haut de l'accueil (les 2 plus récentes). */
export default function NewsBanner({ items }: { items: NewsItem[] }) {
  const pinned = items.filter((i) => i.pinned).slice(0, 2);
  if (pinned.length === 0) return null;
  return (
    <div className="org-banners" role="region" aria-label="Annonces importantes">
      {pinned.map((n) => (
        <a key={n.id} className={`org-banner org-banner--${n.category}`} href={`/organisateur/actualites#${n.id}`}>
          <Icon name={n.category === 'maintenance' ? 'clock' : 'bell'} />
          <span><strong>{NEWS_CATEGORIES[n.category]} · {n.title}</strong></span>
          <Icon name="arrow-right" className="icon org-banner__go" />
        </a>
      ))}
    </div>
  );
}
