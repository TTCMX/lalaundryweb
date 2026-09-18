import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaceholderImage from '../components/PlaceholderImage.jsx';
import { CheckIcon, XIcon } from '../components/Icon.jsx';
import InvitacionMembresia from '../components/InvitacionMembresia.jsx';
import { loadGoogleMaps } from '../lib/googleMaps.js';
import styles from './Agendar.module.css';

const STEP_LABELS = ['Teléfono', 'Dirección', 'Nombre', 'Horario', 'Detalles', 'Pago', 'Listo'];
const LAST_STEP = STEP_LABELS.length - 1;
const DIAS_HORIZON = 6;
const MIN_LEAD_HOURS = 2;
const HORA_DAYTIME = { start: 10, end: 16 };
const HORA_EVENING = { start: 20, end: 22 };
// Which weekdays (0=domingo...6=sábado) get each block, per zone.
const ZONE_SCHEDULES = {
  A: { daytime: [1, 2, 3, 4, 5], evening: [0, 1, 3, 4] },
  B: { daytime: [2, 5], evening: [0, 1, 3, 4] },
  C: { daytime: [], evening: [0, 1, 3, 4] },
  D: { daytime: [], evening: [0, 3] },
  E: { daytime: [], evening: [1, 4] },
};
// Serviced via Uber Direct instead of our own fleet: domingo-jueves only,
// in 1-hour "preferred" windows (not a hard guarantee like the other
// zones) — Uber Direct confirms the exact time over WhatsApp.
const EXTERNAL_ZONES = ['F', 'G'];
const EXTERNAL_DAYS = [0, 1, 2, 3, 4]; // domingo-jueves
function buildHourRanges(startHour, endHour) {
  const ranges = [];
  for (let h = startHour; h < endHour; h += 1) {
    ranges.push({ start: h, end: h + 1 });
  }
  return ranges;
}
const EXTERNAL_RANGES = buildHourRanges(10, 21); // 10am a 9pm
// Las zonas externas solo reciben lavandería y tenis — la tintorería no se
// ofrece ahí, así que hay que avisarlo antes de que agenden.
const SIN_TINTORERIA_MESSAGE =
  'Importante: en tu zona solo está disponible lavandería y tenis. Por ahora no ofrecemos ' +
  'tintorería (sacos, vestidos, abrigos y demás prendas de tintorería).';
const UBER_DIRECT_MESSAGE =
  '¡Tenemos cobertura en tu zona! La recolección y entrega de tu pedido se hace con un ' +
  'proveedor externo (Uber Direct). El transporte es gratis en pedidos de $1,000 o más; en ' +
  'pedidos menores, el transporte cuesta $250. El anticipo que pagues se descuenta del total ' +
  'de tu pedido.';
// Zones where "pagar a la entrega" is offered; every other zone (E, F, G)
// only gets "pagar anticipo en línea".
const ENTREGA_ZONES = ['A', 'B', 'C', 'D'];
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

// Local-time YYYY-MM-DD (not toISOString(), which converts to UTC and can
// shift the date depending on the visitor's timezone).
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Slots less than MIN_LEAD_HOURS away aren't offered — for any day other
// than today every slot is already well past that, so this only ever
// filters today's remaining options.
function horasFor(date, weekdayIndex, zona) {
  let ranges;
  if (EXTERNAL_ZONES.includes(zona)) {
    ranges = EXTERNAL_DAYS.includes(weekdayIndex) ? EXTERNAL_RANGES : [];
  } else {
    const schedule = ZONE_SCHEDULES[zona];
    if (!schedule) return [];
    ranges = [];
    if (schedule.daytime.includes(weekdayIndex)) ranges.push(HORA_DAYTIME);
    if (schedule.evening.includes(weekdayIndex)) ranges.push(HORA_EVENING);
  }
  const cutoff = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000);
  return ranges
    .filter((range) => {
      const slotStart = new Date(date);
      slotStart.setHours(range.start, 0, 0, 0);
      return slotStart >= cutoff;
    })
    .map((range) => ({ ...range, label: formatHoraRange(range) }));
}

// Zone-less (zona === null, e.g. coverage not resolved yet) yields no days.
function buildDiaOptions(zona) {
  const days = [];
  if (!zona) return days;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let scanned = 0;
  while (days.length < DIAS_HORIZON && scanned < 60) {
    scanned++;
    const weekdayIndex = cursor.getDay();
    const horas = horasFor(cursor, weekdayIndex, zona);
    if (horas.length) {
      const weekday = new Intl.DateTimeFormat('es-MX', { weekday: 'long' }).format(cursor);
      const month = new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(cursor);
      const day = cursor.getDate();
      days.push({
        weekdayIndex,
        weekdayLabel: weekday.charAt(0).toUpperCase() + weekday.slice(1),
        short: `${day} ${month.slice(0, 3)}`,
        fullLabel: `${weekday} ${day} de ${month}`,
        isoDate: toISODate(cursor),
        horas,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export default function Agendar() {
  const [step, setStep] = useState(0);
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [cp, setCp] = useState('');
  const [cobertura, setCobertura] = useState('idle'); // idle | checking | covered | not-covered | externo | error
  const [zona, setZona] = useState(null); // A-E once cobertura === 'covered'
  const [place, setPlace] = useState(null); // { lat, lng, placeId } once chosen from Maps suggestions
  const [nombre, setNombre] = useState('');
  const DIAS = useMemo(() => buildDiaOptions(zona), [zona]);
  const [diaSel, setDiaSel] = useState(0);
  const [horaSel, setHoraSel] = useState(0);
  const HORAS = DIAS[diaSel]?.horas || [];
  const selectDia = (i) => {
    setDiaSel(i);
    setHoraSel(0);
  };
  // The zone (and therefore DIAS) can change after a day/hora was already
  // selected under a different zone (e.g. re-checking coverage) — reset the
  // selection so it doesn't point at a stale/out-of-range option.
  useEffect(() => {
    setDiaSel(0);
    setHoraSel(0);
  }, [zona]);
  const [detalles, setDetalles] = useState('');
  const [pago, setPago] = useState(null);
  const entregaAllowed = !!zona && ENTREGA_ZONES.includes(zona);
  // Zones without "pagar a la entrega" only offer paying online — force it
  // as soon as the zone is known so neither the Pago step nor the
  // returning-customer quick-finalize path can slip through with a cash
  // on delivery booking there.
  useEffect(() => {
    if (zona && !entregaAllowed) setPago('linea');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona]);
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

  // Returns the resolved zona (or null if not covered/failed) so callers
  // that need to branch on it (e.g. the returning-customer flow) don't have
  // to wait on a separate state update.
  const checkCoverageFor = async (candidateCp, extra = {}) => {
    if (!candidateCp?.trim()) return null;
    setCobertura('checking');
    try {
      const res = await fetch('/api/check-coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cp: candidateCp.trim(), ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      // Un fallo del servidor NO es falta de cobertura. Se veían igual, así
      // que cualquier caída de la base le decía al cliente que no llegamos a
      // su zona y lo sacaba del embudo sin dejar rastro de por qué.
      if (!res.ok || data.error) {
        console.error('[agendar] no se pudo validar cobertura:', data.error || res.status, data.detalle || '');
        setCobertura('error');
        setZona(null);
        return null;
      }
      if (data.externo) {
        // Known zone, but served via Uber Direct instead of our own
        // scheduler for now — can't proceed to Horario from here.
        setCobertura('externo');
        setZona(null);
        return null;
      }
      setCobertura(data.covered ? 'covered' : 'not-covered');
      const resolvedZona = data.covered ? data.zona || null : null;
      setZona(resolvedZona);
      return resolvedZona;
    } catch (err) {
      // Sin red tampoco sabemos si hay cobertura: no se le puede decir que no.
      console.error('[agendar] no se pudo validar cobertura:', err);
      setCobertura('error');
      setZona(null);
      return null;
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
            setZona(null);
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
        setEsRecurrente(true);

        // Need their zone to know which days/slots to offer — re-derive it
        // from their CP on file. If there's no CP saved (older customers,
        // imported records) or the zone can't be resolved, fall back to the
        // address step so they confirm it fresh via Maps.
        const resolvedZona = c.cp ? await checkCoverageFor(c.cp) : null;
        if (resolvedZona) {
          setStep(3);
        } else {
          setCobertura('idle');
          setStep(1);
        }
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
    // Uber Direct fulfills F/G, not our own fleet — flag it in the notes
    // (which also flow through to the ops app's "notas" field) along with
    // the preferred window the customer picked, since hora_label there
    // isn't a hard-guaranteed slot the way it is for other zones.
    const detallesFinal = EXTERNAL_ZONES.includes(zona)
      ? [`Transporte por tercero. Horario preferido: ${HORAS[horaSel].label}.`, detalles || null]
          .filter(Boolean)
          .join(' ')
      : detalles || undefined;
    const payload = {
      bookingId: bookingIdRef.current,
      telefono,
      email: email || undefined,
      direccion,
      cp,
      nombre,
      diaLabel: DIAS[diaSel].fullLabel,
      horaLabel: HORAS[horaSel].label,
      fecha: DIAS[diaSel].isoDate,
      detalles: detallesFinal,
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
  // Skipping Pago only makes sense where "a la entrega" is a real option —
  // otherwise pago is already forced to 'linea' and there's nothing to skip.
  const canSkip = step === 4 || (step === 5 && entregaAllowed);
  const isLastStep = step === 5;
  // Returning customers skip Detalles/Pago entirely — picking a slot and
  // confirming finalizes the booking right away (pago a la entrega, unless
  // their zone forces pago='linea', in which case this redirects to pay).
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
                  setZona(null);
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
                    {EXTERNAL_ZONES.includes(zona)
                      ? UBER_DIRECT_MESSAGE
                      : '¡Buenas noticias! Tenemos cobertura en tu zona.'}
                  </span>
                </div>
              )}
              {cobertura === 'externo' && (
                <div className={styles.successBanner}>
                  <span className={styles.successIcon}>
                    <CheckIcon />
                  </span>
                  <span className={styles.successText}>{UBER_DIRECT_MESSAGE}</span>
                </div>
              )}
              {(cobertura === 'externo' ||
                (cobertura === 'covered' && EXTERNAL_ZONES.includes(zona))) && (
                <div className={styles.avisoBanner}>
                  <span className={styles.avisoText}>{SIN_TINTORERIA_MESSAGE}</span>
                </div>
              )}
              {cobertura === 'error' && (
                <div className={cx(styles.successBanner, styles.errorBanner)}>
                  <span className={cx(styles.successIcon, styles.errorIcon)}>
                    <XIcon />
                  </span>
                  <span className={cx(styles.successText, styles.errorText)}>
                    No pudimos validar tu dirección en este momento.{' '}
                    <button
                      type="button"
                      onClick={() => checkCoverageFor(cp, { direccion, placeId: place?.placeId, lat: place?.lat, lng: place?.lng })}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      Reintentar
                    </button>
                    , o escríbenos por WhatsApp al 56 4419 8713 y te agendamos nosotros.
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
              {EXTERNAL_ZONES.includes(zona) && (
                <>
                  <p className={styles.hint}>
                    Este es tu horario preferido — un proveedor externo (Uber Direct) lo confirma
                    por WhatsApp.
                  </p>
                  <div className={styles.avisoBanner} style={{ marginTop: 0, marginBottom: 16 }}>
                    <span className={styles.avisoText}>{SIN_TINTORERIA_MESSAGE}</span>
                  </div>
                </>
              )}
              <div className={styles.horasGrid}>
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
                {entregaAllowed
                  ? 'Puedes pagar un anticipo en línea o el total a la entrega.'
                  : 'En tu zona, el anticipo se paga en línea para confirmar tu recolección.'}
              </p>
              {entregaAllowed && (
                <span className={styles.optionalBadge}>Puedes omitir este paso</span>
              )}
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
                {entregaAllowed && (
                  <button
                    className={cx(styles.pagoOption, pago === 'entrega' && styles.pagoOptionSelected)}
                    onClick={() => setPago('entrega')}
                  >
                    <div className={styles.pagoOptionTitle}>Pagar a la entrega</div>
                    <div className={styles.pagoOptionDesc}>
                      Con tarjeta o efectivo cuando recibas tu pedido.
                    </div>
                  </button>
                )}
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
              <InvitacionMembresia telefono={telefono} />
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
