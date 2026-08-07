import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckIcon } from '../components/Icon.jsx';
import styles from './Membresia.module.css';

const OPS_API = import.meta.env.VITE_OPS_API_URL || 'https://app.lalaundry.xyz';

// A donde regresa MercadoPago después de autorizar la suscripción.
//
// Esta página no es solo un "gracias": es donde de verdad se liga la
// membresía al cliente. El checkout de MercadoPago descarta cualquier dato
// nuestro (tira el external_reference y devuelve payer_email vacío), así que
// lo único en común entre las dos partes es el preapproval_id que viene en
// esta URL de retorno, más el cliente que guardamos antes de redirigir.
export default function MembresiaGracias() {
  const [params] = useSearchParams();
  const [estado, setEstado] = useState('ligando'); // ligando | listo | manual

  useEffect(() => {
    const preapprovalId = params.get('preapproval_id');
    let clienteId = null;
    try {
      clienteId = localStorage.getItem('tcc_suscripcion_cliente');
    } catch { /* modo privado */ }

    if (!preapprovalId || !clienteId) {
      // El pago sí se hizo; solo no pudimos ligarlo automáticamente. Se
      // resuelve del lado de operación, sin molestar al cliente.
      setEstado('manual');
      return;
    }

    fetch(`${OPS_API}/api/ligar-suscripcion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preapprovalId, clienteId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setEstado(data?.ok ? 'listo' : 'manual');
        if (data?.ok) {
          try { localStorage.removeItem('tcc_suscripcion_cliente'); } catch { /* noop */ }
        }
      })
      .catch(() => setEstado('manual'));
  }, [params]);

  return (
    <section className={styles.section} style={{ paddingTop: 60 }}>
      <div className={styles.form} style={{ textAlign: 'center' }}>
        <span className={styles.check} style={{ width: 52, height: 52, margin: '0 auto 18px' }}>
          <CheckIcon size={26} />
        </span>
        <h1 className={styles.formTitulo}>¡Bienvenido al club!</h1>
        <p className={styles.formTexto}>
          {estado === 'ligando' && 'Estamos activando tu membresía…'}
          {estado === 'listo' &&
            'Tu membresía quedó activa y ligada a tu WhatsApp. Tus beneficios se aplican la próxima vez que agendes una recolección.'}
          {estado === 'manual' &&
            'Tu pago se registró correctamente. Estamos terminando de activar tu membresía y te confirmamos por WhatsApp en breve.'}
        </p>
        <Link to="/agendar" className={styles.submit} style={{ display: 'block', textDecoration: 'none' }}>
          Agendar mi recolección →
        </Link>
        <p className={styles.legal}>
          Puedes administrar o cancelar tu membresía desde tu cuenta de MercadoPago. Si algo no
          cuadra, escríbenos por WhatsApp y lo revisamos.
        </p>
      </div>
    </section>
  );
}
