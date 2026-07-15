import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaceholderImage from '../components/PlaceholderImage.jsx';
import { CheckIcon, XIcon } from '../components/Icon.jsx';
import { loadGoogleMaps } from '../lib/googleMaps.js';
import styles from './Agendar.module.css';

const STEP_LABELS = ['Teléfono', 'Dirección', 'Nombre', 'Horario', 'Detalles', 'Pago', 'Listo'];
const LAST_STEP = STEP_LABELS.length - 1;
const DIAS_HORIZON = 6;
const SATURDAY = 6;
const TUESDAY = 2;
const FRIDAY = 5;
const MIN_LEAD_HOURS = 2;
// Domingo/Lunes/Miércoles/Jueves get an evening slot too; Martes/Viernes
// don't; Sábado has no pickups at all (skipped when building the day list).
const HORA_RANGES_FULL = [
  { start: 10, end: 13 },
  { start: 13, end: 16 },
  { start: 20, end: 22 },
];
const HORA_RANGES_SHORT = [
  { start: 10, end: 13 },
  { start: 13, end: 16 },
];
const NEXT_LABELS = [
  'Continuar',
  'Continuar',
  'Continuar',
  'Continuar',
  'Continuar',
  'Confirmar agenda',
  'Listo',
];

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

// Slots less than MIN_LEAD_HOURS away aren't offered — for any day other
// than today every slot is already well past that, so this only ever
// filters today's remaining options.
function horasFor(date, weekdayIndex) {
  const ranges = weekdayIndex === TUESDAY || weekdayIndex === FRIDAY ? HORA_RANGES_SHORT : HORA_RANGES_FULL;
  const cutoff = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000);
  return ranges
    .filter((range) => {
      const slotStart = new Date(date);
      slotStart.setHours(range.start, 0, 0, 0);
      return slotStart >= cutoff;
    })
    .map((range) => ({ ...range, label: formatHoraRange(range) }));
}

function buildDiaOptions() {
  const days = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < DIAS_HORIZON) {
    const weekdayIndex = cursor.getDay();
    if (weekdayIndex !== SATURDAY) {
      const horas = horasFor(cursor, weekdayIndex);
      if (horas.length) {
        const weekday = new Intl.DateTimeFormat('es-MX', { weekday: 'long' }).format(cursor);
        const month = new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(cursor);
        const day = cursor.getDate();
        days.push({
          weekdayIndex,
          weekdayLabel: weekday.charAt(0).toUpperCase() + weekday.slice(1),
          short: `${day} ${month.slice(0, 3)}`,
          fullLabel: `${weekday} ${day} de ${month}`,
          horas,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export default function Agendar() {
  const DIAS = useMemo(buildDiaOptions, []);
  const [step, setStep] = useState(0);
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [cp, setCp] = useState('');
  const [cobertura, setCobertura] = useState('idle'); // idle | checking | covered | not-covered
  const [place, setPlace] = useState(null); // { lat, lng, placeId } once chosen from Maps suggestions
  const [nombre, setNombre] = useState('');
  const [diaSel, setDiaSel] = useState(0);
  const [horaSel, setHoraSel] = useState(0);
  const HORAS = DIAS[diaSel]?.horas || [];
  const selectDia = (i) => {
    setDiaSel(i);
    setHoraSel(0);
  };
  const [detalles, setDetalles] = useState('');
  const [pago, setPago] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [slotCounts, setSlotCounts] = useState({});
  const [slotMax, setSlotMax] = useState(5);
  const [esRecurrente, setEsRecurrente] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const direccionInputRef = useRef(null);
  const mapRef = useRef(null);
  const bookingIdRef = useRef(null);

  // Best-effort background save — the customer becomes a lead as soon as we
  // have a phone number, and the same row gets filled in as they keep going,
  // so an abandoned booking still leaves something to follow up on.
  const saveLeadProgress = async (fields) => {
    try {
      const res = await fetch('/api/save-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingIdRef.current, ...fields }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.id) bookingIdRef.current = data.id;
    } catch {
      // Non-fatal — worst case this step's progress isn't saved as a lead.
    }
  };

  const checkCoverageFor = async (candidateCp, extra = {}) => {
    if (!candidateCp?.trim()) return;
    setCobertura('checking');
    try {
      const res = await fetch('/api/check-coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cp: candidateCp.trim(), ...extra }),
      });
      const data = await res.json();
      setCobertura(data.covered ? 'covered' : 'not-covered');
    } catch {
      setCobertura('not-covered');
    }
  };

  // Fallback for when a Maps suggestion was never picked (script blocked,
  // typed and ignored the dropdown, etc.) — best-effort CP from the text.
  const handleDireccionBlur = () => {
    if (place) return;
    const match = direccion.match(/\b\d{5}\b/);
    if (match) {
      setCp(match[0]);
      checkCoverageFor(match[0], { direccion });
    }
  };

  // Attach Google Places Autocomplete to the address input so customers pick
  // a real, verified address instead of typing free text. The input only
  // exists in the DOM while step === 1 (conditionally rendered), and gets a
  // fresh node each time the user re-enters this step, so this has to re-run
  // on every step change rather than once on mount.
  useEffect(() => {
    if (step !== 1 || !direccionInputRef.current) return;
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
            checkCoverageFor(postal, {
              direccion: p.formatted_address || direccionInputRef.current.value,
              placeId: p.place_id,
              lat: p.geometry.location.lat(),
              lng: p.geometry.location.lng(),
            });
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
  }, [step]);

  // Render the confirmation map once a verified place has been chosen. Also
  // re-runs on step change so the map reappears if the customer goes back to
  // this step after already picking an address (fresh <div>, same reason).
  useEffect(() => {
    if (step !== 1 || !place || !mapRef.current || !window.google) return;
    const center = { lat: place.lat, lng: place.lng };
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
    });
    new window.google.maps.Marker({ position: center, map });
  }, [step, place]);

  // Check which day/hora combos already hit the cap so full slots can be
  // grayed out instead of only rejecting at the very last step.
  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    fetch('/api/slot-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diaLabels: DIAS.map((d) => d.fullLabel) }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSlotCounts(data.counts || {});
        if (data.max) setSlotMax(data.max);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step, DIAS]);

  const siguiente = () => setStep((s) => Math.min(s + 1, LAST_STEP));
  const atras = () => setStep((s) => Math.max(s - 1, 0));

  // On the phone step, check whether this number matches a previous real
  // booking — if so, skip straight to Horario with their info on file
  // instead of re-asking for address/name.
  const lookupAndAdvance = async () => {
    setLookingUp(true);
    try {
      const res = await fetch('/api/lookup-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono }),
      });
      const data = res.ok ? await res.json() : { found: false };
      if (data.found) {
        const c = data.customer;
        setNombre(c.nombre || '');
        setDireccion(c.direccion || '');
        setCp(c.cp || '');
        setEmail((prev) => prev || c.email || '');
        if (c.place_id) setPlace({ placeId: c.place_id, lat: c.lat, lng: c.lng });
        setCobertura('covered');
        setEsRecurrente(true);
        setStep(3);
      } else {
        setStep(1);
      }
    } catch {
      setStep(1);
    } finally {
      setLookingUp(false);
    }
  };

  // Persists whatever the current step just collected as part of the lead,
  // in the background, before advancing — so leaving mid-flow still counts.
  const handleContinue = () => {
    if (step === 0) {
      saveLeadProgress({ telefono });
      lookupAndAdvance();
      return;
    }
    if (step === 1) {
      saveLeadProgress({
        direccion,
        cp,
        placeId: place?.placeId,
        lat: place?.lat,
        lng: place?.lng,
      });
    }
    if (step === 2) saveLeadProgress({ nombre, email: email || undefined });
    if (step === 3) {
      saveLeadProgress({ diaLabel: DIAS[diaSel].fullLabel, horaLabel: HORAS[horaSel].label });
    }
    if (step === 4) saveLeadProgress({ detalles: detalles || undefined });
    siguiente();
  };

  const finalizarReserva = async () => {
    setSubmitError('');
    setSubmitting(true);
    const payload = {
      bookingId: bookingIdRef.current,
      telefono,
      email: email || undefined,
      direccion,
      cp,
      nombre,
      diaLabel: DIAS[diaSel].fullLabel,
      horaLabel: HORAS[horaSel].label,
      detalles: detalles || undefined,
      placeId: place?.placeId,
      lat: place?.lat,
      lng: place?.lng,
      esRecurrente,
    };

    try {
      const url = pago === 'linea' ? '/api/create-preference' : '/api/create-booking';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        setSubmitError(data?.message || 'Ese horario ya está lleno. Elige otro.');
        setStep(3);
        return;
      }
      if (!res.ok) throw new Error('finalize-booking-failed');

      const data = await res.json();
      if (pago === 'linea') {
        window.location.href = data.init_point;
        return;
      }
      setStep(LAST_STEP);
    } catch {
      setSubmitError('No pudimos agendar tu recolección. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedHoraCount = slotCounts[DIAS[diaSel]?.fullLabel]?.[HORAS[horaSel]?.label] || 0;
  const requiresTelefono = step === 0 && !telefono;
  const requiresDireccion = step === 1 && (!direccion || cobertura !== 'covered');
  const requiresNombre = step === 2 && !nombre.trim();
  const requiresHorario = step === 3 && selectedHoraCount >= slotMax;
  const nextDisabled =
    requiresTelefono ||
    requiresDireccion ||
    requiresNombre ||
    requiresHorario ||
    submitting ||
    lookingUp;
  const showNav = step < LAST_STEP;
  const canBack = step > 0;
  const canSkip = step === 4 || step === 5;
  const isLastStep = step === 5;
  // Returning customers skip Detalles/Pago entirely — picking a slot and
  // confirming finalizes the booking right away (pago a la entrega).
  const isQuickFinalizeStep = esRecurrente && step === 3;
  const onNext = isLastStep || isQuickFinalizeStep ? finalizarReserva : handleContinue;
  const onSkip = isLastStep ? finalizarReserva : siguiente;
  const nextLabel = lookingUp
    ? 'Buscando…'
    : submitting
      ? 'Procesando…'
      : isQuickFinalizeStep
        ? 'Confirmar agenda'
        : NEXT_LABELS[step];

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
                {i < step ? <CheckIcon size={12} /> : i + 1}
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
                style={{ marginBottom: 0 }}
              />
            </>
          )}

          {step === 1 && (
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
                  setCobertura('idle');
                }}
                onBlur={handleDireccionBlur}
                placeholder="Empieza a escribir tu calle y elige una sugerencia"
              />
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
              {cobertura === 'checking' && (
                <p className={styles.hint}>Verificando cobertura…</p>
              )}
              {cobertura === 'covered' && (
                <div className={styles.successBanner}>
                  <span className={styles.successIcon}>
                    <CheckIcon />
                  </span>
                  <span className={styles.successText}>
                    ¡Buenas noticias! Tenemos cobertura en tu zona.
                  </span>
                </div>
              )}
              {cobertura === 'not-covered' && (
                <div className={cx(styles.successBanner, styles.errorBanner)}>
                  <span className={cx(styles.successIcon, styles.errorIcon)}>
                    <XIcon />
                  </span>
                  <span className={cx(styles.successText, styles.errorText)}>
                    Todavía no tenemos cobertura en ese código postal. Guardamos tu ubicación para
                    avisarte cuando lleguemos a tu zona.
                  </span>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h2 className={styles.stepHeading}>¿Cómo te llamas?</h2>
              <p className={styles.stepSubtext}>
                Para saber a quién buscamos cuando lleguemos a recoger tus prendas.
              </p>
              <label className={styles.label}>Nombre completo</label>
              <input
                type="text"
                className={styles.input}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Juan Pérez"
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

          {step === 3 && (
            <>
              <h2 className={styles.stepHeading}>Elige día y horario</h2>
              <p className={styles.stepSubtext}>Para la recolección de tus prendas.</p>
              {esRecurrente && (
                <div className={styles.successBanner} style={{ marginBottom: 20 }}>
                  <span className={styles.successIcon}>
                    <CheckIcon />
                  </span>
                  <span className={styles.successText}>
                    ¡Qué bueno tenerte de vuelta{nombre ? `, ${nombre}` : ''}! Recogemos en:{' '}
                    {direccion}.
                  </span>
                </div>
              )}
              <div className={styles.diasGrid}>
                {DIAS.map((dia, i) => (
                  <button
                    key={dia.fullLabel}
                    className={cx(styles.choiceButton, diaSel === i && styles.choiceButtonSelected)}
                    onClick={() => selectDia(i)}
                  >
                    <div>{dia.weekdayLabel}</div>
                    <div className={styles.choiceButtonSubtext}>{dia.short}</div>
                  </button>
                ))}
              </div>
              <div className={styles.horasGrid} style={{ gridTemplateColumns: `repeat(${HORAS.length}, 1fr)` }}>
                {HORAS.map((hora, i) => {
                  const count = slotCounts[DIAS[diaSel].fullLabel]?.[hora.label] || 0;
                  const isFull = count >= slotMax;
                  return (
                    <button
                      key={hora.label}
                      className={cx(
                        styles.choiceButton,
                        horaSel === i && styles.choiceButtonSelected,
                        isFull && styles.choiceButtonDisabled
                      )}
                      onClick={() => setHoraSel(i)}
                      disabled={isFull}
                    >
                      {isFull ? 'Lleno' : hora.label}
                    </button>
                  );
                })}
              </div>
              {submitError && <p className={styles.errorMessage}>{submitError}</p>}
            </>
          )}

          {step === 4 && (
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

          {step === 5 && (
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

          {step === 6 && (
            <div className={styles.listo}>
              <div className={styles.listoIcon}>
                <CheckIcon size={28} />
              </div>
              <h2 className={styles.listoTitle}>¡Listo! Tu recolección está agendada.</h2>
              <p className={styles.listoText}>
                Te avisaremos por SMS al número registrado cuando el repartidor esté en camino.
              </p>
              <div className={styles.resumen}>
                <div className={styles.resumenRow}>
                  <span className={styles.resumenLabel}>Nombre</span>
                  <span className={styles.resumenValue}>{nombre || 'Sin especificar'}</span>
                </div>
                <div className={styles.resumenRow}>
                  <span className={styles.resumenLabel}>Teléfono</span>
                  <span className={styles.resumenValue}>{telefono || 'Sin especificar'}</span>
                </div>
                <div className={styles.resumenRow}>
                  <span className={styles.resumenLabel}>Dirección</span>
                  <span className={styles.resumenValue}>{direccion || 'Sin especificar'}</span>
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
                {nextLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
