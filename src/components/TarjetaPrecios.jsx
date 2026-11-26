// La tarjeta "Precios" de /agendar: escala de tenis, tiempo de entrega, envío
// gratis por zona y cómo se paga. Se ve en todos los pasos —a la derecha en
// computadora, arriba y plegable en el celular— para que nadie tenga que
// salir del formulario a buscar cuánto le va a costar.
//
// Los números llegan en `tarifas` (de /api/tarifas, ver server/tarifas.js):
// nada de lo que se anuncia aquí está escrito a mano.
import { useState } from 'react';
import { textoEnvioGratis } from '../../server/tarifas.js';
import { pesos } from '../../server/precios-publicos.js';
import styles from './TarjetaPrecios.module.css';

export default function TarjetaPrecios({ tarifas, zona }) {
  // En el celular arranca plegada: el formulario es lo primero. En
  // computadora el CSS la deja siempre abierta.
  const [abierta, setAbierta] = useState(false);
  const { escalones, desde6 } = tarifas.tenis;

  return (
    <aside className={`${styles.tarjeta} ${abierta ? styles.abierta : ''}`} aria-label="Precios">
      <button type="button" className={styles.encabezado} onClick={() => setAbierta((a) => !a)} aria-expanded={abierta}>
        <span className={styles.titulo}>Precios</span>
        <span className={styles.resumenCorto}>Tenis desde {pesos(desde6)} el par</span>
        <span className={styles.flecha} aria-hidden="true">▾</span>
      </button>

      <div className={styles.contenido}>
        <div className={styles.seccion}>
          <div className={styles.rotulo}>Lavado de tenis</div>
          <table className={styles.tabla}>
            <tbody>
              {escalones.map((e) => (
                <tr key={e.pares}>
                  <td>{e.pares} {e.pares === 1 ? 'par' : 'pares'}</td>
                  <td>{pesos(e.total)}</td>
                </tr>
              ))}
              <tr>
                <td>{escalones.length + 1} o más</td>
                <td>{pesos(desde6)} c/u</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.linea}><span aria-hidden="true">⏱</span> Listos en 3–4 días.</div>

        <div className={styles.linea}>
          <span aria-hidden="true">🚚</span>
          <span>
            Envío gratis {textoEnvioGratis(tarifas.minimos)}.{' '}
            {zona
              ? <b>Tu zona: {zona}.</b>
              : 'Te mostramos tu zona al poner tu dirección.'}
          </span>
        </div>

        <div className={styles.linea}>
          <span aria-hidden="true">💳</span>
          <span>
            Pago: transferencia o link de pago mientras trabajamos tu orden. Tarjeta o efectivo solo en
            entregas de nuestra ruta.
          </span>
        </div>
      </div>
    </aside>
  );
}
