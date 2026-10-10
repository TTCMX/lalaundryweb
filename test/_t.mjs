// Arnés mínimo de pruebas: sin dependencias, corre con node y ya.
//
// Estas pruebas cubren la aritmética del negocio —dinero, permisos de fase y
// puntos— que es donde un error no se ve en pantalla pero sí en la caja.
let ok = 0;
let fallas = 0;

export const t = (nombre, condicion, extra = "") => {
  if (condicion) { ok += 1; return; }
  fallas += 1;
  console.error(`  ✗ ${nombre}${extra !== "" ? ` → ${extra}` : ""}`);
};

export const resumen = (suite) => {
  if (fallas) {
    console.error(`${suite}: ${ok} OK, ${fallas} FALLARON`);
    process.exitCode = 1;
  } else {
    console.log(`${suite}: ${ok} pruebas OK`);
  }
  ok = 0; fallas = 0;
};
