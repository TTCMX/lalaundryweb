import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';
import { CheckIcon } from '../components/Icon.jsx';
import styles from './Membresia.module.css';

// La app de operación vive en otro dominio y es quien habla con MercadoPago
// (necesita el access token, que nunca puede estar en el navegador).
const OPS_API = import.meta.env.VITE_OPS_API_URL || 'https://app.lalaundry.xyz';

const NIVELES = {
  plus: {
    nombre: 'The Clean Club +',
    resumen: 'Para quien lava seguido y quiere descuento fijo en todo.',
    beneficios: [
      '10% de descuento en todas tus compras',
      'Promociones exclusivas para miembros todos los meses',
      'Acceso a preventas y lanzamientos',
    ],
  },
  vip: {
    nombre: 'The Clean Club VIP',
    resumen: 'El nivel más completo: mayor descuento, puntos cada mes y atención prioritaria.',
    destacado: true,
    beneficios: [
      '15% de descuento en todas tus compras',
      'Promociones permanentes exclusivas para miembros VIP',
      '$75 en puntos Club cada mes',
      'Acceso anticipado a nuevos servicios y productos',
      'Comparte tus puntos entre todas las marcas de The Clean Club',
      'Atención prioritaria',
    ],
  },
};

// slug -> precio. Los slugs son los mismos que entiende
// /api/crear-suscripcion (ver lib/planes.js en laundry-os).
const PRECIOS = {
  'plus-mes': { precio: 59, prueba: true },
  'plus-anio': { precio: 499 },
  'vip-mes': { precio: 149, prueba: true },
  'vip-anio': { precio: 1199 },
  'plus-mes-founders': { precio: 39, prueba: true },
  'vip-mes-founders': { precio: 109, prueba: true },
  'vip-anio-founders': { precio: 999 },
  // "plus-anio-founders" no existe a propósito: ese plan no se ofrece.
};

const slugDe = (nivel, periodo, founders) =>
  `${nivel}-${periodo}${founders ? '-founders' : ''}`;

const fmt = (n) => `$${n.toLocaleString('es-MX')}`;

export default function Membresia() {
  const [params] = useSearchParams();
  // Los planes Founders tienen precio especial y no se anuncian: se llega a
  // ellos solo con el link directo /membresia?founders=1.
  const founders = params.get('founders') === '1';

  const [periodo, setPeriodo] = useState('mes');
  const [elegido, setElegido] = useState(null); // slug del plan
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const nivelesVisibles = Object.entries(NIVELES).filter(
    ([nivel]) => PRECIOS[slugDe(nivel, periodo, founders)]
  );

  const suscribir = async () => {
    if (telefono.replace(/\D/g, '').length < 10) {
      setError('Necesitamos tu WhatsApp a 10 dígitos para ligar la membresía a tu cuenta.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const res = await fetch(`${OPS_API}/api/crear-suscripcion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: elegido, nombre, tel: telefono, email: email || undefined }),
      });
      const data = res.ok ? await res.json() : null;
      if (data?.init_point) {
        window.location.href = data.init_point;
        return;
      }
      setError('No pudimos iniciar tu membresía. Intenta de nuevo o escríbenos por WhatsApp.');
    } catch {
      setError('No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.');
    }
    setEnviando(false);
  };

  return (
    <>
      <PageHero
        badge={founders ? 'Membresía Founders' : 'Membresía'}
        title={founders ? 'Precio de fundador' : 'Lava sin pensarlo'}
        text={
          founders
            ? 'Precio especial para los primeros miembros de The Clean Club. Conservas esta tarifa mientras tu membresía siga activa.'
            : 'Descuento en todas tus compras, promociones exclusivas y acceso anticipado a lo nuevo. Cancela cuando quieras.'
        }
        maxWidth={600}
      />

      <section className={styles.section}>
        <div className={styles.toggle}>
          {[
            { key: 'mes', label: 'Mensual' },
            { key: 'anio', label: 'Anual' },
          ].map((p) => (
            <button
              key={p.key}
              className={periodo === p.key ? `${styles.toggleBtn} ${styles.toggleActivo}` : styles.toggleBtn}
              onClick={() => {
                setPeriodo(p.key);
                setElegido(null);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className={styles.planes}>
          {nivelesVisibles.map(([nivel, info]) => {
            const slug = slugDe(nivel, periodo, founders);
            const precio = PRECIOS[slug];
            const mensualDelMismoNivel = PRECIOS[slugDe(nivel, 'mes', founders)];
            const ahorro =
              periodo === 'anio' && mensualDelMismoNivel
                ? mensualDelMismoNivel.precio * 12 - precio.precio
                : 0;

            return (
              <div
                key={nivel}
                className={info.destacado ? `${styles.plan} ${styles.planDestacado}` : styles.plan}
              >
                {info.destacado && <span className={styles.cinta}>Más elegido</span>}
                <h2 className={styles.planNombre}>{info.nombre}</h2>
                <p className={styles.planResumen}>{info.resumen}</p>

                <div className={styles.precioFila}>
                  <span className={styles.precio}>{fmt(precio.precio)}</span>
                  <span className={styles.periodo}>/{periodo === 'mes' ? 'mes' : 'año'}</span>
                </div>
                {precio.prueba && <span className={styles.prueba}>Primeros 30 días gratis</span>}
                {ahorro > 0 && <span className={styles.ahorro}>Ahorras {fmt(ahorro)} al año</span>}

                <ul className={styles.beneficios}>
                  {info.beneficios.map((b) => (
                    <li key={b} className={styles.beneficio}>
                      <span className={styles.check}>
                        <CheckIcon size={12} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>

                <button
                  className={info.destacado ? `${styles.cta} ${styles.ctaDestacado}` : styles.cta}
                  onClick={() => {
                    setElegido(slug);
                    setError('');
                  }}
                >
                  {elegido === slug ? 'Plan elegido' : 'Elegir este plan'}
                </button>
              </div>
            );
          })}
        </div>

        {elegido && (
          <div className={styles.form}>
            <h3 className={styles.formTitulo}>Últimos datos</h3>
            <p className={styles.formTexto}>
              Usamos tu WhatsApp para ligar la membresía a tu cuenta — es el mismo número con el
              que agendas tus recolecciones.
            </p>

            <label className={styles.label}>Nombre</label>
            <input
              className={styles.input}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Juan Pérez"
            />

            <label className={styles.label}>WhatsApp</label>
            <input
              className={styles.input}
              type="tel"
              inputMode="numeric"
              value={telefono}
              onChange={(e) => {
                setTelefono(e.target.value);
                setError('');
              }}
              placeholder="55 1234 5678"
            />

            <label className={styles.label}>Correo (opcional)</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.submit} onClick={suscribir} disabled={enviando}>
              {enviando ? 'Preparando tu pago…' : 'Continuar a MercadoPago →'}
            </button>
            <p className={styles.legal}>
              El cobro lo procesa MercadoPago. Puedes cancelar cuando quieras desde tu cuenta de
              MercadoPago y conservas los beneficios hasta que termine el periodo que ya pagaste.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
