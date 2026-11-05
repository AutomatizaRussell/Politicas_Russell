// Acceptance screen and error pages (contract §4.3). `html` escapes every
// interpolated value; `raw` is used only for the legal source, whose fingerprint
// was already verified against the manifest.

import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Manifiesto } from "./manifiesto.ts";

type Pagina = HtmlEscapedString | Promise<HtmlEscapedString>;

/**
 * Shared frame: a header card with the logo and the title, then a body card.
 * It mirrors the portal's access screens so the person does not feel they left
 * the application that sent them here.
 */
function documento(datos: {
  titulo: string;
  entidad: string | null;
  antetitulo?: string;
  meta?: string;
  cuerpo: Pagina;
}): Pagina {
  const { titulo, entidad, antetitulo, meta, cuerpo } = datos;
  return html`<!doctype html>
<html lang="es"${entidad ? raw(` data-entidad="${entidad}"`) : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${titulo}</title>
  <link rel="stylesheet" href="/estilos.css">
</head>
<body>
  <main class="columna">
    <header class="tarjeta encabezado">
      <img class="logo" src="/logo.png" alt="Russell Bedford" width="168" height="36">
      <div>
        ${antetitulo ? html`<p class="antetitulo">${antetitulo}</p>` : ""}
        <h1>${titulo}</h1>
        ${meta ? html`<p class="meta">${meta}</p>` : ""}
      </div>
    </header>
    <section class="tarjeta cuerpo">${cuerpo}</section>
  </main>
</body>
</html>`;
}

// How each document reads inside the authorization sentence. The noun is apart
// from its article so that only the noun becomes a link.
const EN_LA_FRASE: Record<string, { articulo: string; nombre: string }> = {
  "aviso-privacidad": { articulo: "al", nombre: "aviso de privacidad" },
  "politica-tratamiento": { articulo: "a la", nombre: "política de tratamiento" },
};

/**
 * Project names are stored to read mid-sentence ("el portal de AuditHUB"). As a
 * label above the title they drop the article and start with a capital.
 */
function comoAntetitulo(nombreProyecto: string): string {
  const sinArticulo = nombreProyecto.replace(/^(el|la|los|las)\s+/i, "");
  return sinArticulo.charAt(0).toLocaleUpperCase("es") + sinArticulo.slice(1);
}

export function paginaAceptacion(datos: {
  manifiesto: Manifiesto;
  nombreProyecto: string;
  sujeto: string;
  documentos: string[];
  avisoHtml: string | null;
  solicitud: string;
  csrf: string;
  faltaCasilla: boolean;
}): Pagina {
  const { entidad, vigentes } = datos.manifiesto;

  // The sentence names exactly what this project requires. Whatever is not shown
  // in full on this screen links to its frozen version, the same one the receipt
  // will declare.
  const referencias = datos.documentos.map((tipo, indice) => {
    const { articulo, nombre } = EN_LA_FRASE[tipo] ?? { articulo: "al documento", nombre: tipo };
    const visible = tipo === "aviso-privacidad" && datos.avisoHtml;
    return html`${indice > 0 ? " y " : ""}${articulo} ${
      visible ? nombre : html`<a href="${vigentes[tipo]!.url}" target="_blank" rel="noopener">${nombre}</a>`
    }`;
  });

  return documento({
    titulo: "Autorización de tratamiento de datos",
    entidad: entidad.codigo,
    antetitulo: comoAntetitulo(datos.nombreProyecto),
    meta: datos.sujeto,
    cuerpo: html`
    ${datos.avisoHtml
      ? html`<div class="aviso" role="region" aria-label="Aviso de privacidad" tabindex="0">${raw(datos.avisoHtml)}</div>`
      : ""}
    <form method="post" action="/aceptar">
      <input type="hidden" name="solicitud" value="${datos.solicitud}">
      <input type="hidden" name="csrf" value="${datos.csrf}">
      <label class="casilla">
        <input type="checkbox" name="casilla" value="si">
        <span>Autorizo a ${entidad.razonSocial} a tratar mis datos personales conforme ${referencias}.</span>
      </label>
      ${datos.faltaCasilla
        ? html`<p class="error" role="alert">Para aceptar, marque la casilla. Si no autoriza, elija «No acepto».</p>`
        : ""}
      <div class="acciones">
        <button type="submit" name="decision" value="aceptar" class="primaria">Aceptar</button>
        <button type="submit" name="decision" value="rechazar" class="secundaria">No acepto</button>
      </div>
      <p class="nota">Sin esta autorización no es posible usar ${datos.nombreProyecto}.</p>
    </form>`,
  });
}

export function paginaError(): Pagina {
  return documento({
    titulo: "No se pudo abrir la autorización",
    entidad: null,
    cuerpo: html`<p>El enlace venció, ya se usó o no es válido. Vuelva a la aplicación desde la que llegó e inicie el ingreso otra vez.</p>`,
  });
}

export function paginaNoDisponible(): Pagina {
  return documento({
    titulo: "Autorización no disponible",
    entidad: null,
    cuerpo: html`<p>El servicio no puede completar la autorización en este momento. No se registró ninguna decisión. Inténtelo de nuevo en unos minutos.</p>`,
  });
}

// Tokens first, as on the policy sites: GCT by default, GLT overrides what differs.
// The values follow the portal's access screens; the primary action keeps the
// Russell Bedford orange in both entities.
export const ESTILOS = `
:root {
  --marca: #2a4499;
  --marca-oscura: #001871;
  --accion: #ed8b00;
  --sobre-accion: #001871;
  --tinta: #1e293b;
  --tenue: #64748b;
  --linea: #dce3e8;
  --fondo: #f1f5f9;
  --superficie: #ffffff;
  --superficie-tenue: #f8fafc;
  --peligro: #b3261e;
  --radio-tarjeta: 12px;
  --radio: 8px;
  --espacio-1: 8px;
  --espacio-2: 12px;
  --espacio-3: 16px;
  --espacio-4: 20px;
  --espacio-5: 24px;
  --espacio-6: 32px;
  --texto-pequeno: 12px;
  --texto-aviso: 13px;
  --texto-base: 14px;
  --texto-boton: 15px;
  --texto-titulo: 24px;
  --ancho-columna: 448px;
  --ancho-logo: 168px;
  --alto-aviso: 300px;
  --alto-control: 44px;
  --lado-casilla: 20px;
}
:root[data-entidad="glt"] {
  --marca: #00a9ce;
  --marca-oscura: #007193;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--fondo);
  color: var(--tinta);
  font-family: "Segoe UI", Arial, Helvetica, sans-serif;
  font-size: var(--texto-base);
  line-height: 1.5;
}
.columna {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  max-width: calc(var(--ancho-columna) + 2 * var(--espacio-3));
  margin: 0 auto;
  padding: var(--espacio-6) var(--espacio-3);
}
.tarjeta {
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: var(--radio-tarjeta);
}
.encabezado {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  padding: var(--espacio-4) var(--espacio-5);
}
.logo { display: block; width: var(--ancho-logo); height: auto; }
.antetitulo { margin: 0 0 4px; color: var(--tenue); font-size: var(--texto-pequeno); font-weight: 600; }
h1 { margin: 0; color: var(--marca-oscura); font-size: var(--texto-titulo); font-weight: 700; line-height: 1.2; }
.meta { margin: var(--espacio-1) 0 0; color: var(--tenue); overflow-wrap: anywhere; }
.cuerpo { display: flex; flex-direction: column; gap: var(--espacio-4); padding: var(--espacio-5); }
.cuerpo > p { margin: 0; }
a { color: var(--marca-oscura); }
a:hover { color: var(--marca); }
.aviso {
  max-height: min(var(--alto-aviso), 45vh);
  overflow-y: auto;
  padding: var(--espacio-3);
  background: var(--superficie-tenue);
  border-radius: var(--radio);
  font-size: var(--texto-aviso);
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.aviso h1, .aviso h2, .aviso h3 {
  margin: var(--espacio-3) 0 6px;
  color: var(--marca-oscura);
  font-size: var(--texto-aviso);
  font-weight: 700;
  line-height: 1.4;
}
.aviso > :first-child { margin-top: 0; }
.aviso > :last-child { margin-bottom: 0; }
.aviso p { margin: 0 0 var(--espacio-1); }
.aviso ul, .aviso ol { margin: 0 0 var(--espacio-1); padding-left: 18px; }
form { display: flex; flex-direction: column; gap: var(--espacio-4); margin: 0; }
.casilla { display: flex; gap: var(--espacio-2); align-items: flex-start; line-height: 1.45; cursor: pointer; }
.casilla input {
  flex: none;
  width: var(--lado-casilla);
  height: var(--lado-casilla);
  margin: 1px 0 0;
  accent-color: var(--marca-oscura);
}
.acciones { display: flex; flex-direction: column; gap: var(--espacio-1); }
button {
  min-height: var(--alto-control);
  border: 0;
  border-radius: var(--radio);
  font-family: inherit;
  font-size: var(--texto-boton);
  cursor: pointer;
}
.primaria { background: var(--accion); color: var(--sobre-accion); font-weight: 700; }
.secundaria { background: transparent; color: var(--marca-oscura); font-weight: 600; }
button:focus-visible, a:focus-visible, .aviso:focus-visible, input:focus-visible {
  outline: 2px solid var(--marca);
  outline-offset: 2px;
}
.error { margin: 0; color: var(--peligro); font-weight: 600; }
.nota { margin: 0; color: var(--tenue); font-size: var(--texto-pequeno); }
`;
