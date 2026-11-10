import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';
import styles from './Catalogo.module.css';
import { porCategoria, precioTexto } from '../../server/catalogo.js';

// Esta página ya no tiene precios adentro.
//
// Los tenía: una lista de 36 artículos tecleada aquí, que era la única copia
// del catálogo del sitio. Por eso el bot del chat no sabía cotizar nada que
// no fueran tenis —no había de dónde leerlo— y por eso el catálogo decía
// "Tenis $150" mientras la caja cobraba $390 por tres pares. Ahora la lista
// vive en server/catalogo.js y aquí solo se dibuja: lo que anuncia esta
// página y lo que cotiza el chat son, por construcción, lo mismo.

const PROCESO = [
  { n: '1', titulo: 'Recolectamos' },
  { n: '2', titulo: 'Clasificamos' },
  { n: '3', titulo: 'Limpiamos' },
  { n: '4', titulo: 'Entregamos' },
];

const CATEGORIAS = porCategoria();

export default function Catalogo() {
  return (
    <>
      <PageHero
        badge="Catálogo"
        title="Precios y procesos"
        text="Precios claros por prenda."
        maxWidth={560}
      />

      <section className={styles.proceso}>
        <div className={styles.procesoGrid}>
          {PROCESO.map((p) => (
            <div className={styles.procesoCard} key={p.n}>
              <div className={styles.procesoNumber}>{p.n}</div>
              <div className={styles.procesoTitulo}>{p.titulo}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.categorias}>
        <div className={styles.categoriasList}>
          {CATEGORIAS.map((cat) => (
            <div key={cat.nombre}>
              <div className={styles.categoriaHeader}>
                <h2 className={styles.categoriaNombre}>{cat.nombre}</h2>
                <span className={styles.categoriaNota}>{cat.nota}</span>
              </div>
              <div className={styles.itemsGrid}>
                {cat.items.map((it) => (
                  <div className={styles.item} key={it.nombre}>
                    <div>
                      <div className={styles.itemNombre}>{it.nombre}</div>
                      {it.detalle && <div className={styles.itemDetalle}>{it.detalle}</div>}
                    </div>
                    <div className={styles.itemPrecio}>{precioTexto(it)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.ctaBanner}>
          <div>
            <h3 className={styles.ctaTitle}>¿Ya sabes qué necesitas lavar?</h3>
            <p className={styles.ctaText}>Agenda tu recolección en menos de 2 minutos.</p>
          </div>
          <Link to="/agendar" className={styles.ctaButton}>
            Agendar recolección
          </Link>
        </div>
      </section>
    </>
  );
}
