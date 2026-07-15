import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styles from './AgendarConfirmacion.module.css';
import agendarStyles from './Agendar.module.css';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 8;

const PAGO_STATUS_LABEL = {
  pagado: 'Anticipo pagado en línea',
  rechazado: 'Pago rechazado',
  pendiente: 'Confirmando tu pago…',
  pago_entrega: 'Pago a la entrega',
};

export default function AgendarConfirmacion() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking_id') || searchParams.get('external_reference');

  const [booking, setBooking] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const res = await fetch(`/api/booking-status?id=${encodeURIComponent(bookingId)}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setBooking(data.booking);

        pollCount.current += 1;
        if (data.booking.pago_status === 'pendiente' && pollCount.current < MAX_POLLS) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookingId]);

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <h1 className={styles.title}>Tu recolección</h1>
        <div className={styles.card}>
          {!bookingId || notFound ? (
            <p className={styles.centerText}>
              No encontramos esta reserva. Si acabas de pagar, escríbenos con tu número de
              teléfono para confirmarla.
            </p>
          ) : !booking ? (
            <p className={styles.centerText}>Cargando…</p>
          ) : (
            <div className={agendarStyles.listo}>
              <div className={agendarStyles.listoIcon}>
                {booking.pago_status === 'rechazado' ? '×' : '✓'}
              </div>
              <h2 className={agendarStyles.listoTitle}>
                {booking.pago_status === 'rechazado'
                  ? 'Tu pago no se pudo procesar'
                  : '¡Tu recolección está agendada!'}
              </h2>
              <p className={agendarStyles.listoText}>
                {booking.pago_status === 'rechazado'
                  ? 'Puedes intentar de nuevo o elegir pagar a la entrega.'
                  : 'Te avisaremos cuando el repartidor esté en camino.'}
              </p>
              <div className={agendarStyles.resumen}>
                <div className={agendarStyles.resumenRow}>
                  <span className={agendarStyles.resumenLabel}>Nombre</span>
                  <span className={agendarStyles.resumenValue}>{booking.nombre || 'Sin especificar'}</span>
                </div>
                <div className={agendarStyles.resumenRow}>
                  <span className={agendarStyles.resumenLabel}>Dirección</span>
                  <span className={agendarStyles.resumenValue}>{booking.direccion}</span>
                </div>
                <div className={agendarStyles.resumenRow}>
                  <span className={agendarStyles.resumenLabel}>Teléfono</span>
                  <span className={agendarStyles.resumenValue}>{booking.telefono}</span>
                </div>
                <div className={agendarStyles.resumenRow}>
                  <span className={agendarStyles.resumenLabel}>Horario</span>
                  <span className={agendarStyles.resumenValue}>
                    {booking.dia_label}, {booking.hora_label}
                  </span>
                </div>
                <div className={agendarStyles.resumenRow}>
                  <span className={agendarStyles.resumenLabel}>Pago</span>
                  <span className={agendarStyles.resumenValue}>
                    {PAGO_STATUS_LABEL[booking.pago_status] || booking.pago_status}
                  </span>
                </div>
              </div>
              {booking.pago_status === 'pendiente' && (
                <p className={styles.pendingNote}>Esto puede tardar unos segundos…</p>
              )}
              <Link to="/" className={agendarStyles.volverLink}>
                Volver al inicio →
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
