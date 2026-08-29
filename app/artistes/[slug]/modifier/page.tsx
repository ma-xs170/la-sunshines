import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ArtistSelfEdit from '@/components/ArtistSelfEdit';
import { getArtistBySlug } from '@/lib/artistProfiles';
import { getArtistSession } from '@/lib/artistAuth';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export const metadata: Metadata = {
  title: 'Mon espace artiste · LA SUNSHINES',
  robots: { index: false, follow: false },
};

export default async function ArtistEditPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  // accès réservé à l'artiste connecté sur CE slug
  const session = await getArtistSession();
  if (session !== slug) {
    redirect(`/artistes/${slug}`);
  }

  const artist = getArtistBySlug(slug);
  if (!artist || !artist.verified) {
    redirect(`/artistes/${slug}`);
  }

  return (
    <>
      <Nav />
      <main className="artist-edit">
        <div className="artist-edit__head">
          <p className="script">Mon espace artiste</p>
          <h1>{artist.name}</h1>
          <p className="artist-edit__sub">
            Modifie ta page publique. Les changements sont mis en ligne
            automatiquement (~1&nbsp;min).
          </p>
        </div>
        <ArtistSelfEdit
          slug={artist.slug}
          initial={{
            image: artist.image,
            banner: artist.banner,
            bio: artist.bio,
            instagram: artist.instagram,
            tiktok: artist.tiktok,
            soundcloud: artist.soundcloud,
            email: artist.email,
          }}
        />
      </main>
      <Footer />
    </>
  );
}
