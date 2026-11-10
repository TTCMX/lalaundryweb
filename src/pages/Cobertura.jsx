import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';
import { CheckIcon, XIcon } from '../components/Icon.jsx';
import styles from './Cobertura.module.css';
import {
  gruposDeTransporte, transporteDeZona, formatoPesos, hayTintoreria,
} from '../../server/agenda.js';

// Los números de transporte salen de server/agenda.js, no de aquí.
//
// Aquí vivía una segunda tabla —ZONE_GROUPS y GROUP_INFO— que no coincidía
// con la del formulario: ésta anunciaba transporte gratis desde $300 en la
// zona C y desde $500 en la E; /agendar le decía al mismo cliente $500 y
// $1,000. La página que lee antes de agendar prometía más barato que la que
// usa al agendar. Ahora las dos leen la misma tabla y el conflicto no se
// puede repetir.
const GRUPOS = gruposDeTransporte();

export default function Cobertura() {
  const [cp, setCp] = useState('');
  const [status, setStatus] = useState('idle'); // idle | checking | covered | not-covered
  const [zona, setZona] = useState(null);

  const consultar = async () => {
    const trimmed = cp.trim();
    if (!/^\d{5}$/.test(trimmed)) return;
    setStatus('checking');
    try {
      const res = await fetch('/api/check-coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cp: trimmed }),
      });
      const data = await res.json();
      if (data.covered) {
        setZona(data.zona || null);
        setStatus('covered');
      } else {
        setZona(null);
        setStatus('not-covered');
      }
    } catch {
      setZona(null);
      setStatus('not-covered');
    }
  };

  const info = zona ? transporteDeZona(zona) : null;
  const sinTintoreria = zona ? !hayTintoreria(zona) : false;

  return (
    <>
      <PageHero
        badge="Cobertura"
        title="Consulta tu cobertura"
        text="Ingresa tu código postal y te decimos en qué zona estás y a partir de cuánto el transporte es gratis."
        maxWidth={560}
      />

      <section className={styles.section}>
        <div className={styles.card}>
          <label className={styles.label}>Código postal</label>
          <div className={styles.inputRow}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              className={styles.input}
              value={cp}
              onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && consultar()}
              placeholder="03100"
            />
            <button
              className={styles.button}
              onClick={consultar}
              disabled={status === 'checking' || !/^\d{5}$/.test(cp.trim())}
            >
              {status === 'checking' ? 'Consultando…' : 'Consultar'}
            </button>
          </div>

          {status === 'covered' && (
            <div className={styles.resultBanner}>
              <span className={styles.resultIcon}>
                <CheckIcon />
              </span>
              <div>
                <p className={styles.resultTitle}>Tenemos cobertura — estás en la zona {zona}.</p>
                {info && (
                  <p className={styles.resultText}>
                    {sinTintoreria &&
                      'La recolección y entrega en tu zona se hace con un proveedor externo (Uber Direct). '}
                    El transporte es gratis en pedidos de {formatoPesos(info.minimo)} o más. En pedidos
                    menores, el transporte cuesta {formatoPesos(info.costo)}.
                  </p>
                )}
                {sinTintoreria && (
                  <p className={styles.resultAviso}>
                    Importante: en tu zona solo está disponible lavandería y tenis. Por ahora no
                    ofrecemos tintorería.
                  </p>
                )}
              </div>
            </div>
          )}

          {status === 'not-covered' && (
            <div className={`${styles.resultBanner} ${styles.resultBannerError}`}>
              <span className={`${styles.resultIcon} ${styles.resultIconError}`}>
                <XIcon />
              </span>
              <div>
                <p className={styles.resultTitle}>
                  Todavía no tenemos cobertura en ese código postal.
                </p>
                <p className={styles.resultText}>
                  Guardamos tu ubicación para avisarte cuando lleguemos a tu zona.
                </p>
              </div>
            </div>
          )}

          <table className={styles.groupTable}>
            <thead>
              <tr>
                <th>Zonas</th>
                <th>Mínimo para transporte gratis</th>
                <th>Costo si no se alcanza</th>
              </tr>
            </thead>
            <tbody>
              {GRUPOS.map((g) => (
                <tr key={g.zonas.join('')}>
                  <td>{g.zonas.join(', ')}</td>
                  <td>{formatoPesos(g.minimo)}</td>
                  <td>{formatoPesos(g.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Link to="/agendar" className={styles.agendarLink}>
            Agendar recolección →
          </Link>
        </div>
      </section>
    </>
  );
}
