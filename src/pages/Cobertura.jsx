import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';
import { CheckIcon, XIcon } from '../components/Icon.jsx';
import styles from './Cobertura.module.css';

// Same grouping used for the free-transport threshold, independent of the
// day/hora scheduling rules per zone (see ZONE_SCHEDULES in Agendar.jsx).
const ZONE_GROUPS = { A: 'ABC', B: 'ABC', C: 'ABC', D: 'DE', E: 'DE', F: 'FG', G: 'FG' };
const GROUP_INFO = {
  ABC: { minimo: '$300', costo: '$100' },
  DE: { minimo: '$500', costo: '$180' },
  FG: { minimo: '$1,000', costo: '$250' },
};

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

  const grupo = zona ? ZONE_GROUPS[zona] : null;
  const info = grupo ? GROUP_INFO[grupo] : null;

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
                    {grupo === 'FG' &&
                      'La recolección y entrega en tu zona se hace con un proveedor externo (Uber Direct). '}
                    El transporte es gratis en pedidos de {info.minimo} o más. En pedidos
                    menores, el transporte cuesta {info.costo}.
                  </p>
                )}
                {grupo === 'FG' && (
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
              <tr>
                <td>A, B, C</td>
                <td>$300</td>
                <td>$100</td>
              </tr>
              <tr>
                <td>D, E</td>
                <td>$500</td>
                <td>$180</td>
              </tr>
              <tr>
                <td>F, G</td>
                <td>$1,000</td>
                <td>$250</td>
              </tr>
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
