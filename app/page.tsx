import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Marquee from '@/components/Marquee';
import EditionsPreview from '@/components/EditionsPreview';
import Infos from '@/components/Infos';
import CtaBand from '@/components/CtaBand';
import Footer from '@/components/Footer';
import BizoukWidget from '@/components/BizoukWidget';
import {
  getAllEditions,
  getNextEdition,
  getFeaturedEdition,
} from '@/lib/content';
import { isEditionUpcoming } from '@/lib/editions';
import { getBizoukEmbed } from '@/lib/bizouk';

export default function Home() {
  const editions = getAllEditions();
  const nextEdition = getNextEdition();
  // bandeau CTA : prochaine à venir, ou la plus récente passée (-> « Merci »)
  const featuredEdition = getFeaturedEdition();

  // Billetterie de la prochaine édition — affichée en tête de page tant que
  // l'édition n'est pas passée (auto-masquée sinon).
  const upcoming =
    nextEdition && isEditionUpcoming(nextEdition) ? nextEdition : null;
  const upcomingEmbed = upcoming
    ? upcoming.bizoukEmbed?.trim() || getBizoukEmbed(upcoming.slug)
    : null;

  return (
    <>
      <Nav />

      <main>
        <Hero />

        {upcoming && upcomingEmbed && (
          <section className="home-tickets" id="prochaine-billetterie">
            <header className="section-head">
              <span className="script">Prochaine soirée · {upcoming.name}</span>
              <h2>Billetterie</h2>
            </header>
            <BizoukWidget embed={upcomingEmbed} />
          </section>
        )}

        <Marquee />
        <EditionsPreview editions={editions} />
        <Infos nextVenue={nextEdition?.venue ?? null} preview />
        {featuredEdition && <CtaBand edition={featuredEdition} />}
      </main>

      <Footer />
    </>
  );
}
