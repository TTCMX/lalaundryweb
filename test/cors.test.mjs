import { t, resumen } from "./_t.mjs";
import { rechazar, origenPermitido } from "../server/cors.js";

// Simulacro de req/res: solo lo que toca `rechazar`.
const req = (extra = {}) => ({ method: "POST", headers: {}, ...extra });
const res = () => {
  const r = { code: null, cuerpo: null, headers: {}, terminado: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  r.end = () => { r.terminado = true; return r; };
  return r;
};
const corre = (peticion) => {
  const r = res();
  const cortado = rechazar(peticion, r);
  return { cortado, r };
};

// ─── Origen ───────────────────────────────────────────────────────────────
for (const origen of [
  "https://lalaundry.xyz",
  "https://www.lalaundry.xyz",
  "https://app.laundry.xyz",
]) {
  const { cortado, r } = corre(req({ headers: { origin: origen } }));
  t(`pasa el origen propio ${origen}`, cortado === false);
  t(`devuelve el ACAO de ${origen}`, r.headers["Access-Control-Allow-Origin"] === origen);
}

for (const origen of [
  "https://lalaundry.xyz.evil.com",
  "http://lalaundry.xyz",
  "https://evil.com",
  "null",
]) {
  const { cortado, r } = corre(req({ headers: { origin: origen } }));
  t(`rechaza ${origen}`, cortado === true && r.code === 403);
  t(`no le devuelve ACAO a ${origen}`, r.headers["Access-Control-Allow-Origin"] === undefined);
}

// Las vistas previas de Vercel cambian de subdominio en cada push.
t("acepta una vista previa de Vercel",
  corre(req({ headers: { origin: "https://lalaundry-git-rama-abc.vercel.app" } })).cortado === false);
t("no acepta un dominio que solo termina en vercel.app",
  corre(req({ headers: { origin: "https://evil-vercel.app" } })).cortado === true);

// ─── Referer como respaldo ────────────────────────────────────────────────
t("acepta el referer cuando no hay origin",
  corre(req({ headers: { referer: "https://lalaundry.xyz/agendar" } })).cortado === false);
t("rechaza un referer ajeno",
  corre(req({ headers: { referer: "https://evil.com/x" } })).cortado === true);
t("un referer que solo empieza igual no cuela",
  corre(req({ headers: { referer: "https://lalaundry.xyz.evil.com/x" } })).cortado === true);
t("sin origin ni referer se rechaza",
  corre(req()).cortado === true);
t("un referer basura no truena",
  corre(req({ headers: { referer: "no-es-una-url" } })).cortado === true);

// ─── Método y preflight ───────────────────────────────────────────────────
const pre = res();
t("el preflight se contesta con 204",
  rechazar(req({ method: "OPTIONS", headers: { origin: "https://lalaundry.xyz" } }), pre) === true
    && pre.code === 204);
t("el preflight no exige origen conocido",
  rechazar(req({ method: "OPTIONS" }), res()) === true);

const malMetodo = res();
t("el método equivocado da 405",
  rechazar(req({ method: "GET", headers: { origin: "https://lalaundry.xyz" } }), malMetodo) === true
    && malMetodo.code === 405);

const getOk = res();
t("un endpoint de GET acepta GET",
  rechazar(req({ method: "GET", headers: { origin: "https://lalaundry.xyz" } }), getOk,
    { metodo: "GET" }) === false);

// El origen se revisa después del método, pero nunca se salta.
t("GET con origen ajeno se rechaza igual",
  rechazar(req({ method: "GET", headers: { origin: "https://evil.com" } }), res(),
    { metodo: "GET" }) === true);

// ─── origenPermitido suelto ───────────────────────────────────────────────
t("origenPermitido no se traga un origin vacío",
  origenPermitido({ headers: { origin: "" } }) === false);
t("origenPermitido sin headers no truena",
  origenPermitido({}) === false);

resumen("cors");
