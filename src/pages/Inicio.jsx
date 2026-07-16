import { Link } from 'react-router-dom';
import styles from './Inicio.module.css';

const PASOS = [
  { n: '1', titulo: 'Agenda', desc: 'Ingresa tu dirección, teléfono y horario preferido.' },
  { n: '2', titulo: 'Recolectamos', desc: 'Pasamos por tus prendas en el horario elegido.' },
  { n: '3', titulo: 'Limpiamos', desc: 'Clasificamos y procesamos cada prenda con cuidado.' },
  { n: '4', titulo: 'Entregamos', desc: 'Recibes tu pedido listo en unas 72 horas.' },
];

const DATOS = [
  { valor: '72h', label: 'tiempo estimado de entrega' },
  { valor: '$300', label: 'para envío y recolección gratis' },
  { valor: '100%', label: 'a domicilio, sin filas' },
];

export default function Inicio() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroDecoration} />
        <div className={styles.heroContent}>
          <span className={styles.heroBadge}>Recolección y entrega a domicilio</span>
          <h1 className={styles.heroTitle}>Tu lavandería de confianza, directo a tu puerta.</h1>
          <p className={styles.heroText}>
            Lavado, tintorería y planchado con procesos claros y precios justos. Recogemos,
            limpiamos y entregamos en unas 72 horas.
          </p>
          <div className={styles.heroActions}>
            <Link to="/agendar" className={styles.btnPrimary}>
              Agendar recolección
            </Link>
            <Link to="/catalogo" className={styles.btnSecondary}>
              Ver catálogo y precios
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.steps}>
        <h2 className={styles.stepsTitle}>Cómo funciona</h2>
        <div className={styles.stepsGrid}>
          {PASOS.map((p) => (
            <div className={styles.step} key={p.n}>
              <div className={styles.stepNumber}>{p.n}</div>
              <h3 className={styles.stepTitle}>{p.titulo}</h3>
              <p className={styles.stepDesc}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Academy oculta temporalmente — se retoma más adelante. */}

      <section className={styles.ctaSection}>
        <div className={styles.ctaBanner}>
          <div>
            <h2 className={styles.ctaTitle}>¿Listo para agendar tu recolección?</h2>
            <p className={styles.ctaText}>
              Valida cobertura, elige horario y listo. Entrega y recolección gratis en órdenes
              superiores a $300.
            </p>
            <Link to="/agendar" className={styles.btnPrimary} style={{ padding: '14px 28px', fontSize: 15 }}>
              Agendar ahora
            </Link>
          </div>
          <div className={styles.ctaStats}>
            {DATOS.map((d) => (
              <div className={styles.ctaStat} key={d.label}>
                <span className={styles.ctaStatValue}>{d.valor}</span>
                <span className={styles.ctaStatLabel}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
