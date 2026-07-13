import styles from './PageHero.module.css';

export default function PageHero({ badge, title, text, maxWidth = 560 }) {
  return (
    <section className={styles.hero}>
      <span className={styles.badge}>{badge}</span>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text} style={{ maxWidth }}>
        {text}
      </p>
    </section>
  );
}
