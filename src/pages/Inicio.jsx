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
  { valor: '100%', label: 'a domicilio, sin filas' },
];

const PROMO_TENIS = [
  { pares: '1', precio: '$150', transporte: '$100' },
  { pares: '2', precio: '$280', transporte: '$20' },
  { pares: '3', precio: '$390', transporte: 'Gratis' },
  { pares: '4', precio: '$480', transporte: 'Gratis' },
  { pares: '5', precio: '$550', transporte: 'Gratis' },
  { pares: '6 o más', precio: '$100 por par', transporte: 'Gratis' },
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

      <section className={styles.promos}>
        <h2 className={styles.stepsTitle}>Promociones activas</h2>
        <div className={styles.promosGrid}>
          <div className={styles.promoCard}>
            <span className={styles.promoBadge}>Promo</span>
            <h3 className={styles.promoTitle}>Lavado de tenis</h3>
            <p className={styles.promoDesc}>
              Entre más pares laves en una misma recolección, menos pagas de transporte.
            </p>
            <table className={styles.promoTable}>
              <thead>
                <tr>
                  <th># de pares</th>
                  <th>Precio</th>
                  <th>Transporte*</th>
                </tr>
              </thead>
              <tbody>
                {PROMO_TENIS.map((row) => (
                  <tr key={row.pares}>
                    <td>{row.pares}</td>
                    <td>{row.precio}</td>
                    <td>{row.transporte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.promoFootnote}>*Aplica para transporte en zona A, B y C.</p>
          </div>
          <div className={styles.promoCard}>
            <span className={styles.promoBadge}>Promo</span>
            <h3 className={styles.promoTitle}>Edredones y cubrecolchones</h3>
            <p className={styles.promoDesc}>
              Llévate 3 piezas y paga solo 2 — la de menor precio va gratis.
            </p>
            <div className={styles.promoHighlight}>3x2</div>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.ctaBanner}>
          <div>
            <h2 className={styles.ctaTitle}>¿Listo para agendar tu recolección?</h2>
            <p className={styles.ctaText}>Valida cobertura, elige horario y listo.</p>
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
