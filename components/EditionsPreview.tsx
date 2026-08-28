import Link from 'next/link';
import Icon from './Icon';
import EditionCard from './EditionCard';
import type { Edition } from '@/lib/editions';

// Aperçu sur la homepage : prochaine édition + 1 passée, puis « Voir + » vers /editions.
export default function EditionsPreview({ editions }: { editions: Edition[] }) {
  const ordered = [
    ...editions.filter((e) => e.status === 'next'),
    ...editions.filter((e) => e.status === 'past'),
  ];
  const preview = ordered.slice(0, 2);

  return (
    <section id="editions" className="editions">
      <header className="section-head">
        <span className="script">La sauuuuceee</span>
        <h2>Les éditions</h2>
      </header>

      {preview.map((edition) => (
        <EditionCard key={edition.slug} edition={edition} />
      ))}

      <div className="editions__more">
        <Link className="btn btn--outline btn--lg" href="/editions">
          <span>Voir&nbsp;+</span>
          <Icon name="arrow-right" />
        </Link>
      </div>
    </section>
  );
}
