import { t, resumen } from "./_t.mjs";
import { limitar } from "../server/rateLimit.js";

const req = (ip) => ({ headers: { "x-forwarded-for": ip }, socket: {} });
const res = () => {
  const r = { code: null, cuerpo: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  return r;
};

// Cada prueba usa su propio `nombre` para no compartir cubeta con las demás.
const golpear = (ip, veces, opciones) => {
  let bloqueados = 0;
  let ultima = null;
  for (let i = 0; i < veces; i += 1) {
    const r = res();
    if (limitar(req(ip), r, opciones)) { bloqueados += 1; ultima = r; }
  }
  return { bloqueados, ultima };
};

// ─── Tope ─────────────────────────────────────────────────────────────────
const bajoTope = golpear("1.1.1.1", 3, { max: 3, nombre: "p1" });
t("tres llamadas con tope de tres pasan", bajoTope.bloqueados === 0);

const pasado = golpear("2.2.2.2", 5, { max: 3, nombre: "p2" });
t("la cuarta y la quinta se bloquean", pasado.bloqueados === 2);
t("responde 429", pasado.ultima.code === 429);
t("dice cuánto esperar", typeof pasado.ultima.cuerpo?.retryAfter === "number");
t("manda Retry-After", !!pasado.ultima.headers["Retry-After"]);

// ─── Aislamiento ──────────────────────────────────────────────────────────
golpear("3.3.3.3", 5, { max: 2, nombre: "p3" });
t("otra IP arranca limpia",
  golpear("4.4.4.4", 2, { max: 2, nombre: "p3" }).bloqueados === 0);

golpear("5.5.5.5", 5, { max: 2, nombre: "endpointA" });
t("otro endpoint lleva su propia cuenta",
  golpear("5.5.5.5", 2, { max: 2, nombre: "endpointB" }).bloqueados === 0);

// ─── Ventana ──────────────────────────────────────────────────────────────
// Con una ventana ya vencida la cubeta se reinicia en la siguiente llamada.
golpear("6.6.6.6", 3, { max: 1, ventanaMs: 1, nombre: "p4" });
await new Promise((r) => setTimeout(r, 5));
t("al vencer la ventana vuelve a pasar",
  golpear("6.6.6.6", 1, { max: 1, ventanaMs: 1, nombre: "p4" }).bloqueados === 0);

// ─── Identificación ───────────────────────────────────────────────────────
// Vercel manda la cadena completa de proxies; la primera es la del cliente.
const cadena = { headers: { "x-forwarded-for": "7.7.7.7, 10.0.0.1" }, socket: {} };
limitar(cadena, res(), { max: 1, nombre: "p5" });
t("toma la primera IP de x-forwarded-for",
  limitar(req("7.7.7.7"), res(), { max: 1, nombre: "p5" }) === true);

// Sin encabezado no debe tronar ni dejar pasar a todos por una cubeta nula.
const pelado = { headers: {}, socket: { remoteAddress: "8.8.8.8" } };
t("sin x-forwarded-for usa la IP del socket",
  limitar(pelado, res(), { max: 1, nombre: "p6" }) === false);
t("y la cuenta igual",
  limitar(pelado, res(), { max: 1, nombre: "p6" }) === true);

const sinNada = { headers: {}, socket: {} };
t("sin ninguna IP no truena",
  limitar(sinNada, res(), { max: 1, nombre: "p7" }) === false);

resumen("rateLimit");
