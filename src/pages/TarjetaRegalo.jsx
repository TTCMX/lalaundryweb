import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TARJETAS, porcentajeBono, formatMXN } from '../lib/tarjetas.js';
import styles from './TarjetaRegalo.module.css';

const POLL_MS = 2500;
const MAX_POLLS = 10;

// Pantalla de gracias: se entra aquí de vuelta de MercadoPago. El código solo
// existe cuando el webhook confirmó el cobro, y eso puede tardar unos
// segundos, así que se consulta hasta que aparezca.
function Gracias({ id }) {
  const [estado, setEstado] = useState(null);
  const [falló, setFalló] = useState(false);
  const intentos = useRef(0);

  useEffect(() => {
    let vivo = true;
    let timer;
    async function consultar() {
      try {
        const res = await fetch(`/api/tarjeta-estado?id=${encodeURIComponent(id)}`);
        if (!res.ok) { if (vivo) setFalló(true); return; }
        const data = await res.json();
        if (!vivo) return;
        setEstado(data);
        intentos.current += 1;
        if (data.estado === 'pendiente_pago' && intentos.current < MAX_POLLS) {
          timer = setTimeout(consultar, POLL_MS);
        }
      } catch {
        if (vivo) setFalló(true);
      }
    }
    consultar();
    return () => { vivo = false; clearTimeout(timer); };
  }, [id]);

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <h1 className={styles.title}>Tu tarjeta de regalo</h1>
        <div className={styles.card}>
          {falló && <p className={styles.centro}>No encontramos esta compra. Si ya pagaste, escríbenos y la buscamos.</p>}
          {!falló && !estado && <p className={styles.centro}>Cargando…</p>}
          {estado?.estado === 'pendiente_pago' && (
            <>
              <p className={styles.centro}>Estamos confirmando tu pago. Esto tarda unos segundos.</p>
              <p className={styles.nota}>
                Si cierras esta página no pasa nada: en cuanto se confirme, te mandamos
                el código por correo.
              </p>
            </>
          )}
          {estado?.codigo && (
            <>
              <p className={styles.centro}>
                ¡Listo! {estado.destinatario ? `La tarjeta de ${estado.destinatario} ` : 'Tu tarjeta '}
                tiene <strong>{formatMXN(estado.creditos)}</strong> de saldo.
              </p>
              <div className={styles.codigo}>{estado.codigo}</div>
              <p className={styles.nota}>
                También te lo mandamos por correo. El saldo no caduca y se puede usar en
                varios pedidos: si sobra, se queda en la tarjeta. Para usarlo, basta con
                dar el código al agendar o a quien recoja.
              </p>
            </>
          )}
          {estado && estado.estado !== 'pendiente_pago' && !estado.codigo && (
            <p className={styles.centro}>Esta tarjeta no está disponible. Escríbenos y la revisamos.</p>
          )}
          <p className={styles.centro} style={{ marginTop: 22 }}>
            <Link to="/">Volver al inicio →</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

export default function TarjetaRegalo() {
  const [params] = useSearchParams();
  const idGracias = params.get('id');

  const [precio, setPrecio] = useState(TARJETAS[1].precio);
  const [compradorNombre, setCompradorNombre] = useState('');
  const [compradorEmail, setCompradorEmail] = useState('');
  const [destinatarioNombre, setDestinatarioNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  if (idGracias) return <Gracias id={idGracias} />;

  const comprar = async () => {
    if (enviando) return;
    setError('');
    if (!compradorEmail.trim()) { setError('Necesitamos tu correo para mandarte el código.'); return; }
    setEnviando(true);
    try {
      const res = await fetch('/api/comprar-tarjeta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio, compradorNombre, compradorEmail, destinatarioNombre, mensaje }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.init_point) {
        setError(data.error === 'correo-invalido'
          ? 'Ese correo no se ve bien. Revísalo y vuelve a intentar.'
          : 'No pudimos iniciar el pago. Intenta de nuevo en un momento.');
        setEnviando(false);
        return;
      }
      window.location.href = data.init_point;
    } catch {
      setError('No pudimos iniciar el pago. Intenta de nuevo en un momento.');
      setEnviando(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <h1 className={styles.title}>Tarjetas de regalo</h1>
        <p className={styles.intro}>
          Regala ropa limpia. El saldo no caduca, se puede usar en varios pedidos
          y siempre vale más de lo que pagas.
        </p>

        <div className={styles.card}>
          <div className={styles.paquetes}>
            {TARJETAS.map((t) => (
              <button
                key={t.precio}
                type="button"
                onClick={() => setPrecio(t.precio)}
                className={`${styles.paquete} ${precio === t.precio ? styles.paqueteSel : ''}`}
              >
                <div className={styles.paquetePrecio}>{formatMXN(t.precio)}</div>
                <div className={styles.paqueteSaldo}>{formatMXN(t.creditos)} de saldo</div>
                <div className={styles.paqueteBono}>+{porcentajeBono(t)}% de regalo</div>
              </button>
            ))}
          </div>

          <label className={styles.label}>Tu correo</label>
          <input
            type="email"
            className={styles.input}
            value={compradorEmail}
            onChange={(e) => setCompradorEmail(e.target.value)}
            placeholder="Ahí te mandamos el código"
          />

          <label className={styles.label}>Tu nombre (opcional)</label>
          <input
            type="text"
            className={styles.input}
            value={compradorNombre}
            onChange={(e) => setCompradorNombre(e.target.value)}
            placeholder="Para saber de quién es el regalo"
          />

          <label className={styles.label}>¿Para quién es? (opcional)</label>
          <input
            type="text"
            className={styles.input}
            value={destinatarioNombre}
            onChange={(e) => setDestinatarioNombre(e.target.value)}
            placeholder="Nombre de quien la recibe"
          />

          <label className={styles.label}>Mensaje (opcional)</label>
          <input
            type="text"
            className={styles.input}
            maxLength={280}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Va en el correo con el código"
          />

          <button
            className={`${styles.boton} ${enviando ? styles.botonOff : ''}`}
            onClick={comprar}
            disabled={enviando}
          >
            {enviando ? 'Llevándote al pago…' : `Comprar por ${formatMXN(precio)}`}
          </button>
          {error && <p className={styles.error}>{error}</p>}

          <p className={styles.nota}>
            El pago es con MercadoPago. En cuanto se confirme te mandamos el código
            por correo, y también lo ves aquí mismo. Se canjea al agendar o con quien
            recoja tu pedido.
          </p>
        </div>
      </div>
    </section>
  );
}
