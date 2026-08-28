import Image from 'next/image';
import Icon from './Icon';

const INSTAGRAM = 'https://www.instagram.com/sunshines.fwi/';
const TIKTOK = 'https://tiktok.com/@sunshines.fwi';
const WHATSAPP = 'https://chat.whatsapp.com/JSAjw0eePuGLrbYE2xncDA?mode=gi_t';

export default function Footer() {
  return (
    <footer id="contact">
      <div className="foot-inner">
        <div className="foot-grid">
          <div className="foot-col">
            <span className="foot-col__cat">Nos events</span>
            <div className="foot-col__links">
              <a href="/editions">Agenda événements</a>
              <a href="/interdits">Interdits &amp; accès</a>
            </div>
          </div>
          <div className="foot-col">
            <span className="foot-col__cat">Booking</span>
            <div className="foot-col__links">
              <a href="/#billetterie">Billetterie</a>
              <a href="/editions">Programmation</a>
            </div>
          </div>
          <div className="foot-col">
            <span className="foot-col__cat">Media</span>
            <div className="foot-col__links">
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
              <a href={TIKTOK} target="_blank" rel="noopener noreferrer">
                TikTok
              </a>
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            </div>
          </div>
          <div className="foot-col">
            <span className="foot-col__cat">Contact</span>
            <div className="foot-col__links">
              <a href="/contact">Nous contacter</a>
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
                Rejoins-nous
              </a>
            </div>
          </div>
        </div>

        <a className="foot-logo" href="/#accueil" aria-label="LA SUNSHINES — accueil">
          <Image
            className="foot-logo__img"
            src="/images/logo.png"
            alt="LA SUNSHINES"
            width={848}
            height={168}
          />
        </a>

        <p className="foot-social__label">Suivez-nous sur nos réseaux</p>
        <div className="foot-social">
          <a
            className="foot-social__ico"
            href={INSTAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
          >
            <Icon name="instagram" />
          </a>
          <a
            className="foot-social__ico"
            href={TIKTOK}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TikTok"
          >
            <Icon name="tiktok" />
          </a>
          <a
            className="foot-social__ico"
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
          >
            <Icon name="whatsapp" />
          </a>
        </div>

        <hr className="foot-sep" />

        <div className="foot-bottom">
          <span>© 2026 LA SUNSHINES — THE MOUV. Tous droits réservés.</span>
          <span>
            <a href="/politique-de-confidentialite">Politique de confidentialité</a> ·{' '}
            <a href="/mentions-legales">Mentions légales</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
