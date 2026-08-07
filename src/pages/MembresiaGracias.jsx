import { Link } from 'react-router-dom';
import { CheckIcon } from '../components/Icon.jsx';
import styles from './Membresia.module.css';

// A donde regresa MercadoPago después de autorizar la suscripción (back_url
// en api/crear-suscripcion.js). Es solo confirmación visual: quien marca la
// membresía como activa es el webhook, no esta página — el cliente podría
// cerrar el navegador aquí y su membresía quedaría igual de válida.
export default function MembresiaGracias() {
  return (
    <section className={styles.section} style={{ paddingTop: 60 }}>
      <div className={styles.form} style={{ textAlign: 'center' }}>
        <span
          className={styles.check}
          style={{ width: 52, height: 52, margin: '0 auto 18px' }}
        >
          <CheckIcon size={26} />
        </span>
        <h1 className={styles.formTitulo}>¡Bienvenido al club!</h1>
        <p className={styles.formTexto}>
          Tu membresía quedó activa. La ligamos al WhatsApp que registraste, así que tus beneficios
          se aplican solos la próxima vez que agendes una recolección.
        </p>
        <Link to="/agendar" className={styles.submit} style={{ display: 'block', textDecoration: 'none' }}>
          Agendar mi recolección →
        </Link>
        <p className={styles.legal}>
          Si algo no cuadra, escríbenos por WhatsApp y lo revisamos. Puedes administrar o cancelar
          tu membresía desde tu cuenta de MercadoPago.
        </p>
      </div>
    </section>
  );
}
