import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';
import styles from './Catalogo.module.css';

const PROCESO = [
  { n: '1', titulo: 'Recolectamos' },
  { n: '2', titulo: 'Clasificamos' },
  { n: '3', titulo: 'Limpiamos' },
  { n: '4', titulo: 'Entregamos' },
];

const CATEGORIAS = [
  {
    nombre: 'Lavandería',
    nota: 'Recolección y entrega gratis en órdenes +$300 · ~72h',
    items: [
      { nombre: 'Ropa y ropa de cama', precio: '$40', detalle: 'Por kg' },
      { nombre: 'Edredón', precio: '$160', detalle: 'Matrimonial +$10, Queen +$20, King +$30, Pluma +$55' },
      { nombre: 'Tenis', precio: '$150', detalle: '' },
      { nombre: 'Gorras', precio: '$80', detalle: 'Gamuza y ante +$20' },
      { nombre: 'Almohada', precio: '$170', detalle: 'Queen y King +$30' },
      { nombre: 'Mochila', precio: '$140', detalle: 'Maleta o grande +$30, cuero +$40' },
      { nombre: 'Cubrecolchón', precio: '$300', detalle: 'Matrimonial +$30, Queen +$70, King +$100' },
      { nombre: 'Sneakers — lavado en seco', precio: '$250', detalle: '' },
      { nombre: 'Botas — lavado en seco', precio: '$300', detalle: '' },
      { nombre: 'Bolsas — mantenimiento', precio: 'Desde $250', detalle: '' },
    ],
  },
  {
    nombre: 'Tintorería',
    nota: 'Recolección y entrega gratis en órdenes +$300',
    items: [
      { nombre: 'Saco', precio: '$140', detalle: '' },
      { nombre: 'Vestido', precio: '$200', detalle: '' },
      { nombre: 'Suéter', precio: '$130', detalle: '' },
      { nombre: 'Pantalón', precio: '$140', detalle: '' },
      { nombre: 'Falda', precio: '$110', detalle: '' },
      { nombre: 'Camisa', precio: '$110', detalle: '' },
      { nombre: 'Abrigo', precio: '$230', detalle: '' },
      { nombre: 'Gabardina', precio: '$250', detalle: '' },
      { nombre: 'Corbata', precio: '$110', detalle: '' },
      { nombre: 'Bolsas', precio: '$140', detalle: '' },
      { nombre: 'Chamarra de piel', precio: '$900', detalle: '' },
      { nombre: 'Seda o lino', precio: '+$40', detalle: 'Recargo sobre prenda de tintorería' },
    ],
  },
  {
    nombre: 'Otros servicios',
    nota: 'Recolección y entrega gratis en órdenes +$300',
    items: [
      { nombre: 'Planchado', precio: '$35', detalle: '' },
      { nombre: 'Planchado largo', precio: '$60', detalle: '' },
      { nombre: 'Desmanchado', precio: '$100', detalle: 'Por pieza' },
      { nombre: 'Planchado de mantel', precio: '$140', detalle: 'Por m²' },
      { nombre: 'Transporte sencillo', precio: '$70', detalle: '' },
      { nombre: 'Suelas amarillas', precio: '$150', detalle: '' },
      { nombre: 'Lavado a mano', precio: '$70', detalle: 'Por prenda' },
      { nombre: 'Bolsa', precio: 'Desde $140', detalle: '' },
      { nombre: 'Teñido', precio: 'Desde $300', detalle: '' },
      { nombre: 'Vestido de novia', precio: 'Desde $1,500', detalle: '' },
      { nombre: 'Lavado enzimático', precio: 'Desde $100', detalle: '' },
    ],
  },
];

export default function Catalogo() {
  return (
    <>
      <PageHero
        badge="Catálogo"
        title="Precios y procesos"
        text="Precios claros por prenda. Recolección y entrega gratis en órdenes superiores a $300."
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
                    <div className={styles.itemPrecio}>{it.precio}</div>
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
