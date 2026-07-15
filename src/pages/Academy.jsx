import PageHero from '../components/PageHero.jsx';
import PlaceholderImage from '../components/PlaceholderImage.jsx';
import { CheckIcon, XIcon } from '../components/Icon.jsx';
import styles from './Academy.module.css';

const TEMAS = [
  {
    icon: <CheckIcon />,
    titulo: 'Se resuelve en casa',
    desc: 'Manchas frescas, olores leves y arrugas que puedes tratar tú mismo antes de que se fijen.',
  },
  {
    icon: '!',
    titulo: 'Mejor déjanoslo a nosotros',
    desc: 'Telas delicadas, manchas viejas o prendas de tintorería que necesitan proceso profesional.',
  },
  {
    icon: <XIcon />,
    titulo: 'Ya no tiene remedio',
    desc: 'Casos donde el daño es permanente: quemaduras, decoloración o desgaste irreversible.',
  },
];

const CASOS = [
  { tipo: 'En casa', titulo: 'Cómo quitar una mancha de vino recién caída', placeholder: 'mancha de vino' },
  { tipo: 'En casa', titulo: 'Eliminar olor a humedad en ropa guardada', placeholder: 'ropa guardada' },
  { tipo: 'Déjanoslo a nosotros', titulo: 'Manchas de grasa en seda o lino', placeholder: 'tela delicada' },
  { tipo: 'Sin remedio', titulo: 'Cuando una quemadura de plancha ya no se recupera', placeholder: 'prenda dañada' },
];

export default function Academy() {
  return (
    <>
      <PageHero
        badge="Academy"
        title="Aprende a cuidar tus prendas"
        text="Casos reales: qué puedes resolver tú mismo en casa y cuándo es momento de dejarlo en nuestras manos (o cuándo ya no tiene remedio)."
        maxWidth={600}
      />

      <section className={styles.temas}>
        <div className={styles.temasGrid}>
          {TEMAS.map((cat) => (
            <div className={styles.temaCard} key={cat.titulo}>
              <div className={styles.temaIcon}>{cat.icon}</div>
              <h3 className={styles.temaTitulo}>{cat.titulo}</h3>
              <p className={styles.temaDesc}>{cat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.casos}>
        <div className={styles.casosInner}>
          <h2 className={styles.casosTitle}>Próximos casos</h2>
          <div className={styles.casosGrid}>
            {CASOS.map((c) => (
              <div className={styles.casoCard} key={c.titulo}>
                <PlaceholderImage label={`foto/video: ${c.placeholder}`} aspectRatio="16/9" fontSize={12} />
                <div className={styles.casoBody}>
                  <span className={styles.casoTipo}>{c.tipo}</span>
                  <h3 className={styles.casoTitulo}>{c.titulo}</h3>
                </div>
              </div>
            ))}
          </div>
          <p className={styles.casosFooter}>
            Contenido en construcción — próximamente más casos y videos.
          </p>
        </div>
      </section>
    </>
  );
}
