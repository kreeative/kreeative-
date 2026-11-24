import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import styles from './apropos.module.css';

export const metadata: Metadata = {
  title: 'À propos · Jehre',
  description: 'Jehre, créé par Anne-Kelly Kouyate : des sites bien faits, avec nos modes de paiement africains.',
};

/** « À propos »: who made Jehre and why, in her words. */
export default function AboutPage() {
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <a href="/" aria-label="Jehre, accueil" className={styles.logo}><Icon name="cloud" size={44} /></a>
        <a href="/" className={styles.back}>Retour à Jehre</a>
      </header>
      <article className={styles.body}>
        <p className={styles.eyebrow}>À propos</p>
        <h1>L’histoire de Jehre</h1>
        <p className={styles.lead}>Je m’appelle <b>Anne-Kelly Kouyate</b>. Je suis étudiante à l’Université de Toronto, en bachelor de technologie.</p>
        <p>J’ai créé Jehre pour ma diaspora et pour ma communauté. Je voulais que chacun puisse avoir un site bien fait, avec nos modes de paiement africains : Wave, le mobile money, le paiement à la livraison.</p>
        <p>Jehre est pensé pour l’Afrique de l’Ouest francophone. Et il s’utilise partout dans le monde.</p>
        <div className={styles.acts}>
          <ButtonLink href="/modeles/" iconEnd="arrow">Voir les modèles</ButtonLink>
          <ButtonLink variant="secondary" href="/compte/">Créer mon compte</ButtonLink>
        </div>
      </article>
    </main>
  );
}
