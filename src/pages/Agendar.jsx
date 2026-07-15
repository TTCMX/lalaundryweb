import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaceholderImage from '../components/PlaceholderImage.jsx';
import { loadGoogleMaps } from '../lib/googleMaps.js';
import styles from './Agendar.module.css';

const STEP_LABELS = ['Dirección', 'Teléfono', 'Horario', 'Detalles', 'Pago', 'Listo'];
const DIA_OFFSETS = [
  { offset: 1, relative: 'Mañana' },
  { offset: 2, relative: 'Pasado mañana' },
  { offset: 3, relative: 'En 3 días' },
];
const HORA_RANGES = [
  { start: 9, end: 11 },
  { start: 11, end: 13 },
  { start: 15, end: 17 },
  { start: 17, end: 19 },
];
const NEXT_LABELS = ['Continuar', 'Continuar', 'Continuar', 'Continuar', 'Confirmar agenda', 'Listo'];

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function formatHour12(hour) {
  const period = hour < 12 ? 'am' : 'pm';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}${period}`;
}

function formatHoraRange({ start, end }) {
  return `${formatHour12(start)}-${formatHour12(end)}`;
}

function buildDiaOptions() {
  const today = new Date();
  return DIA_OFFSETS.map(({ offset, relative }) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const weekday = new Intl.DateTimeFormat('es-MX', { weekday: 'long' }).format(date);
    const month = new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(date);
    const day = date.getDate();
    return {
      relative,
      short: `${day} ${month.slice(0, 3)}`,
      fullLabel: `${weekday} ${day} de ${month}`,
    };
  });
}

const HORAS = HORA_RANGES.map((range) => ({ ...range, label: formatHoraRange(range) }));

export default function Agendar() {
  const DIAS = useMemo(buildDiaOptions, []);
  const [step, setStep] = useState(0);
  const [direccion, setDireccion] = useState('');
  const [cp, setCp] = useState('');
  const [cobertura, setCobertura] = useState('idle'); // idle | checking | covered | not-covered
  const [place, setPlace] = useState(null); // { lat, lng, placeId } once chosen from Maps suggestions
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [diaSel, setDiaSel] = useState(0);
  const [horaSel, setHoraSel] = useState(0);
  const [detalles, setDetalles] = useState('');
  const [pago, setPago] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const direccionInputRef = useRef(null);
  const mapRef = useRef(null);

  const checkCoverageFor = async (candidateCp) => {
    if (!candidateCp?.trim()) return;
    setCobertura('checking');
    try {
      const res = await fetch('/api/check-coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cp: candidateCp.trim() }),
      });
      const data = await res.json();
      setCobertura(data.covered ? 'covered' : 'not-covered');
    } catch {
      setCobertura('not-covered');
    }
  };

  const verificarCobertura = () => checkCoverageFor(cp);

  // Attach Google Places Autocomplete to the address input so customers pick
  // a real, verified address instead of typing free text.
  useEffect(() => {
    let autocomplete;
    let listener;
    loadGoogleMaps()
      .then((google) => {
        if (!direccionInputRef.current) return;
        autocomplete = new google.maps.places.Autocomplete(direccionInputRef.current, {
          componentRestrictions: { country: 'mx' },
          fields: ['formatted_address', 'address_components', 'geometry', 'place_id'],
        });
        listener = autocomplete.addListener('place_changed', () => {
          const p = autocomplete.getPlace();
          if (!p.geometry?.location) return;
          const postal = p.address_components?.find((c) => c.types.includes('postal_code'))?.long_name;
          setDireccion(p.formatted_address || direccionInputRef.current.value);
          setPlace({
            lat: p.geometry.location.lat(),
            lng: p.geometry.location.lng(),
            placeId: p.place_id,
          });
          if (postal) {
            setCp(postal);
            checkCoverageFor(postal);
          } else {
            setCobertura('idle');
          }
        });
      })
      .catch((err) => console.warn('[agendar] Google Maps unavailable, falling back to free text:', err));

    return () => {
      if (listener) listener.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the confirmation map once a verified place has been chosen.
  useEffect(() => {
    if (!place || !mapRef.current || !window.google) return;
    const center = { lat: place.lat, lng: place.lng };
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
    });
    new window.google.maps.Marker({ position: center, map });
  }, [place]);

  const siguiente = () => setStep((s) => Math.min(s + 1, 5));
  const atras = () => setStep((s) => Math.max(s - 1, 0));

  const finalizarReserva = async () => {
    setSubmitError('');
    setSubmitting(true);
    const payload = {
      direccion,
      cp,
      telefono,
      email: email || undefined,
      diaLabel: DIAS[diaSel].fullLabel,
      horaLabel: HORAS[horaSel].label,
      detalles: detalles || undefined,
      placeId: place?.placeId,
      lat: place?.lat,
      lng: place?.lng,
    };

    try {
      if (pago === 'linea') {
        const res = await fetch('/api/create-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('create-preference-failed');
        const data = await res.json();
        window.location.href = data.init_point;
        return;
      }

      const res = await fetch('/api/create-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('create-booking-failed');
      setStep(5);
    } catch {
      setSubmitError('No pudimos agendar tu recolección. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const requiresDireccion = step === 0 && (!direccion || cobertura !== 'covered');
  const requiresTelefono = step === 1 && !telefono;
  const nextDisabled = requiresDireccion || requiresTelefono || submitting;
  const showNav = step < 5;
  const canBack = step > 0;
  const canSkip = step === 3 || step === 4;
  const isLastStep = step === 4;
  const onNext = isLastStep ? finalizarReserva : siguiente;
  const onSkip = isLastStep ? finalizarReserva : siguiente;

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <h1 className={styles.title}>Agenda tu recolección</h1>

        <div className={styles.stepper}>
          <div className={styles.stepperLine} />
          {STEP_LABELS.map((label, i) => (
            <div className={styles.stepperItem} key={label}>
              <div
                className={styles.stepperCircle}
                style={{
                  background: i <= step ? 'var(--color-orange)' : 'var(--color-card)',
                  color: i <= step ? 'var(--color-orange-on)' : 'var(--color-text-muted)',
                  borderColor: i <= step ? 'var(--color-orange)' : 'var(--color-border-strong)',
                }}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span
                className={styles.stepperLabel}
                style={{ color: i === step ? 'var(--color-navy)' : 'var(--color-text-muted)' }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.card}>
          {step === 0 && (
            <>
              <h2 className={styles.stepHeading}>¿Dónde recogemos?</h2>
              <p className={styles.stepSubtext}>
                Ingresa tu dirección para validar si tenemos cobertura en tu zona.
              </p>
              <label className={styles.label}>Dirección completa</label>
              <input
                ref={direccionInputRef}
                type="text"
                className={styles.input}
                value={direccion}
                onChange={(e) => {
                  setDireccion(e.target.value);
                  setPlace(null);
                }}
                placeholder="Empieza a escribir tu calle y elige una sugerencia"
              />
              <label className={styles.label}>Código postal</label>
              <div className={styles.inlineRow}>
                <input
                  type="text"
                  className={styles.inlineInput}
                  value={cp}
                  onChange={(e) => {
                    setCp(e.target.value);
                    setCobertura('idle');
                  }}
                  placeholder="Ej. 06700"
                />
                <button
                  className={styles.verifyButton}
                  onClick={verificarCobertura}
                  disabled={cobertura === 'checking'}
                >
                  {cobertura === 'checking' ? 'Verificando…' : 'Verificar'}
                </button>
              </div>
              <p className={styles.hint}>
                La ubicación también se confirma sobre un mapa antes de agendar.
              </p>
              {place ? (
                <div
                  ref={mapRef}
                  style={{ aspectRatio: '16/6', borderRadius: 12, marginBottom: 18 }}
                />
              ) : (
                <PlaceholderImage
                  label="Elige una dirección sugerida arriba para ver el mapa"
                  aspectRatio="16/6"
                  borderRadius={12}
                  fontSize={12}
                  style={{ marginBottom: 18 }}
                />
              )}
              {cobertura === 'covered' && (
                <div className={styles.successBanner}>
                  <span className={styles.successIcon}>✓</span>
                  <span className={styles.successText}>
                    ¡Buenas noticias! Tenemos cobertura en tu zona.
                  </span>
                </div>
              )}
              {cobertura === 'not-covered' && (
                <div className={cx(styles.successBanner, styles.errorBanner)}>
                  <span className={cx(styles.successIcon, styles.errorIcon)}>×</span>
                  <span className={cx(styles.successText, styles.errorText)}>
                    Todavía no tenemos cobertura en ese código postal.
                  </span>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <h2 className={styles.stepHeading}>¿A qué número te contactamos?</h2>
              <p className={styles.stepSubtext}>
                Usamos este número para confirmar tu recolección y avisos de entrega.
              </p>
              <label className={styles.label}>Teléfono</label>
              <input
                type="tel"
                className={styles.input}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="55 1234 5678"
              />
              <label className={styles.label}>Correo (opcional)</label>
              <input
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                style={{ marginBottom: 0 }}
              />
            </>
          )}

          {step === 2 && (
            <>
              <h2 className={styles.stepHeading}>Elige día y horario</h2>
              <p className={styles.stepSubtext}>Para la recolección de tus prendas.</p>
              <div className={styles.diasGrid}>
                {DIAS.map((dia, i) => (
                  <button
                    key={dia.relative}
                    className={cx(styles.choiceButton, diaSel === i && styles.choiceButtonSelected)}
                    onClick={() => setDiaSel(i)}
                  >
                    <div>{dia.relative}</div>
                    <div className={styles.choiceButtonSubtext}>{dia.short}</div>
                  </button>
                ))}
              </div>
              <div className={styles.horasGrid}>
                {HORAS.map((hora, i) => (
                  <button
                    key={hora.label}
                    className={cx(styles.choiceButton, horaSel === i && styles.choiceButtonSelected)}
                    onClick={() => setHoraSel(i)}
                  >
                    {hora.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className={styles.stepHeading}>Agrega detalles</h2>
              <p className={styles.stepSubtextTight}>
                Opcional — instrucciones especiales para la recolección o tus prendas.
              </p>
              <span className={styles.optionalBadge}>Puedes omitir este paso</span>
              <textarea
                className={styles.textarea}
                value={detalles}
                onChange={(e) => setDetalles(e.target.value)}
                placeholder="Ej. Tocar timbre 2, dejar con el portero, cuidado con botones..."
                rows={6}
              />
            </>
          )}

          {step === 4 && (
            <>
              <h2 className={styles.stepHeading}>Pago</h2>
              <p className={styles.stepSubtextTight}>
                Puedes pagar un anticipo en línea o el total a la entrega.
              </p>
              <span className={styles.optionalBadge}>Puedes omitir este paso</span>
              <div className={styles.pagoOptions}>
                <button
                  className={cx(styles.pagoOption, pago === 'linea' && styles.pagoOptionSelected)}
                  onClick={() => setPago('linea')}
                >
                  <div className={styles.pagoOptionTitle}>Pagar anticipo en línea</div>
                  <div className={styles.pagoOptionDesc}>
                    Te llevamos a MercadoPago para completar el pago de forma segura.
                  </div>
                </button>
                <button
                  className={cx(styles.pagoOption, pago === 'entrega' && styles.pagoOptionSelected)}
                  onClick={() => setPago('entrega')}
                >
                  <div className={styles.pagoOptionTitle}>Pagar a la entrega</div>
                  <div className={styles.pagoOptionDesc}>
                    Con tarjeta o efectivo cuando recibas tu pedido.
                  </div>
                </button>
              </div>
              {submitError && <p className={styles.errorMessage}>{submitError}</p>}
            </>
          )}

          {step === 5 && (
            <div className={styles.listo}>
              <div className={styles.listoIcon}>✓</div>
              <h2 className={styles.listoTitle}>¡Listo! Tu recolección está agendada.</h2>
              <p className={styles.listoText}>
                Te avisaremos por SMS al número registrado cuando el repartidor esté en camino.
              </p>
              <div className={styles.resumen}>
                <div className={styles.resumenRow}>
                  <span className={styles.resumenLabel}>Dirección</span>
                  <span className={styles.resumenValue}>{direccion || 'Sin especificar'}</span>
                </div>
                <div className={styles.resumenRow}>
                  <span className={styles.resumenLabel}>Teléfono</span>
                  <span className={styles.resumenValue}>{telefono || 'Sin especificar'}</span>
                </div>
                <div className={styles.resumenRow}>
                  <span className={styles.resumenLabel}>Horario</span>
                  <span className={styles.resumenValue}>
                    {DIAS[diaSel].fullLabel}, {HORAS[horaSel].label}
                  </span>
                </div>
                <div className={styles.resumenRow}>
                  <span className={styles.resumenLabel}>Pago</span>
                  <span className={styles.resumenValue}>Pago a la entrega</span>
                </div>
              </div>
              <Link to="/" className={styles.volverLink}>
                Volver al inicio →
              </Link>
            </div>
          )}
        </div>

        {showNav && (
          <div className={styles.navRow}>
            {canBack ? (
              <button className={styles.backButton} onClick={atras} disabled={submitting}>
                Atrás
              </button>
            ) : (
              <div />
            )}
            <div className={styles.navRowActions}>
              {canSkip && (
                <button className={styles.skipButton} onClick={onSkip} disabled={submitting}>
                  Omitir
                </button>
              )}
              <button
                className={cx(styles.nextButton, nextDisabled && styles.nextButtonDisabled)}
                disabled={nextDisabled}
                onClick={onNext}
              >
                {submitting ? 'Procesando…' : NEXT_LABELS[step]}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
