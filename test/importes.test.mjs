// Que ninguna pantalla use algo de los módulos compartidos sin importarlo.
//
// POR QUÉ EXISTE ESTA PRUEBA: `Agendar.jsx` usaba `ZONAS_TRANSPORTE_PROPIO`
// sin haberlo importado. Quedó suelto cuando las reglas de agenda salieron de
// esa pantalla a server/agenda.js. No lo atrapó nada: este proyecto no tiene
// linter, el build de Vite no resuelve nombres sueltos, y el único camino que
// pasaba por ahí era el feliz —dirección válida y zona cubierta— así que no
// se veía ni abriendo la página.
//
// Lo que hacía en producción: al validar la dirección, React lanzaba
// ReferenceError a media pintada, desmontaba el árbol entero y el cliente se
// quedaba viendo el color de fondo del sitio justo en el paso de agendar.
//
// La prueba es a propósito tonta y de texto: lee cada archivo de `src`, mira
// qué nombres de los módulos compartidos aparecen, y exige que estén en algún
// `import`. No entiende JavaScript —no hace falta— y no se le escapa el caso
// que importa, que es el nombre que nadie trajo.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, resumen } from './_t.mjs';

import * as agenda from '../server/agenda.js';
import * as catalogo from '../server/catalogo.js';
import * as precios from '../server/precios-publicos.js';
import * as correo from '../server/correo.js';
import * as pago from '../server/pago.js';
import * as membresia from '../server/membresia.js';

const COMPARTIDOS = { agenda, catalogo, precios, correo, pago, membresia };

// Fuera comentarios antes de mirar nada. Si no, un nombre mencionado en un
// comentario cuenta como uso (falso positivo) y un comentario dentro de la
// lista de imports rompe la lectura de esa lista (falso negativo). Los dos
// casos pasaron al escribir esta prueba.
const sinComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\`])\/\/[^\n]*/g, '$1');

function archivosDe(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return archivosDe(ruta);
    return /\.(jsx?|mjs)$/.test(n) ? [ruta] : [];
  });
}

// Todo lo que el archivo trae de algún import, sin importar de dónde.
const importados = (src) => {
  const nombres = new Set();
  for (const m of src.matchAll(/import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/gs)) {
    for (const n of m[1].replace(/[{}]/g, ' ').split(',')) {
      const limpio = n.trim().split(/\s+as\s+/).pop().trim();
      if (limpio) nombres.add(limpio);
    }
  }
  return nombres;
};

// Lo que el archivo declara por su cuenta: puede llamarse igual que algo de
// un módulo compartido sin que sea un error.
const declarados = (src) => {
  const nombres = new Set();
  for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    nombres.add(m[1]);
  }
  return nombres;
};

const archivos = archivosDe('src');
t('hay archivos que revisar', archivos.length > 5);

let sueltos = [];
for (const ruta of archivos) {
  const src = sinComentarios(readFileSync(ruta, 'utf8'));
  const traidos = importados(src);
  const propios = declarados(src);

  for (const [modulo, exportado] of Object.entries(COMPARTIDOS)) {
    for (const nombre of Object.keys(exportado)) {
      if (nombre === 'default') continue;
      if (traidos.has(nombre) || propios.has(nombre)) continue;
      // Se usa como identificador suelto: ni después de un punto (que sería
      // una propiedad de otra cosa) ni dentro de una cadena.
      if (new RegExp(`(^|[^.\\w'"\`])${nombre}\\b`).test(src)) {
        sueltos.push(`${ruta} usa ${nombre} (de server/${modulo}) sin importarlo`);
      }
    }
  }
}

t('ninguna pantalla usa algo compartido sin importarlo',
  sueltos.length === 0, sueltos.join('; '));

// Y que la prueba de verdad detecta el caso: si no, pasaría siempre y no
// serviría de nada.
{
  const falso = sinComentarios(
    "import { diasDisponibles } from '../../server/agenda.js';\n"
    + "// aquí se menciona MENSAJE_UBER_DIRECT pero no se usa\n"
    + "ZONAS_TRANSPORTE_PROPIO.includes('A');",
  );
  const traidos = importados(falso);
  const propios = declarados(falso);
  t('la prueba sí atrapa un nombre sin importar',
    !traidos.has('ZONAS_TRANSPORTE_PROPIO') && !propios.has('ZONAS_TRANSPORTE_PROPIO')
    && /(^|[^.\w'"`])ZONAS_TRANSPORTE_PROPIO\b/.test(falso));
  t('y no se queja de uno que sí vino', traidos.has('diasDisponibles'));
  t('ni cuenta como uso lo que solo aparece en un comentario',
    !/(^|[^.\w'"`])MENSAJE_UBER_DIRECT\b/.test(falso));
}

resumen('importes');
