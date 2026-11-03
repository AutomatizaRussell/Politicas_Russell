// Acceptance screen and error page (contract §4.3). `html` escapes every
// interpolated value; `raw` is used only for the legal source, whose fingerprint
// was already verified against the manifest.

import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Manifiesto } from "./manifiesto.ts";

type Pagina = HtmlEscapedString | Promise<HtmlEscapedString>;

function documento(titulo: string, entidad: string | null, cuerpo: Pagina): Pagina {
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
  <main class="hoja">${cuerpo}</main>
</body>
</html>`;
}

export const ETIQUETAS: Record<string, string> = {
  "aviso-privacidad": "Aviso de privacidad",
  "politica-tratamiento": "Política de tratamiento de datos personales",
};

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
  // Everything not shown in full on this screen is offered as a link to its
  // frozen version, the same one the receipt will declare.
  const enlaces = datos.documentos.filter((tipo) => !(tipo === "aviso-privacidad" && datos.avisoHtml));

  return documento(
    "Autorización de tratamiento de datos personales",
    entidad.codigo,
    html`
    <h1>Autorización de tratamiento de datos personales</h1>
    <p class="entrada">
      <strong>${entidad.razonSocial}</strong> (NIT ${entidad.nit}) solicita autorización para
      tratar los datos personales de <strong>${datos.sujeto}</strong> para usar
      ${datos.nombreProyecto}.
    </p>
    ${datos.avisoHtml
      ? html`<section class="aviso" aria-label="Aviso de privacidad" tabindex="0">${raw(datos.avisoHtml)}</section>`
      : ""}
    ${enlaces.map(
      (tipo) => html`<p class="enlace">
        <a href="${vigentes[tipo]!.url}" target="_blank" rel="noopener">
          Leer: ${ETIQUETAS[tipo] ?? tipo}, versión ${vigentes[tipo]!.version}
        </a>
      </p>`,
    )}
    <form method="post" action="/aceptar">
      <input type="hidden" name="solicitud" value="${datos.solicitud}">
      <input type="hidden" name="csrf" value="${datos.csrf}">
      <label class="casilla">
        <input type="checkbox" name="casilla" value="si">
        <span>
          Autorizo a ${entidad.razonSocial} a tratar mis datos personales conforme al aviso de
          privacidad y a la política de tratamiento de datos personales.
        </span>
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
  );
}

export function paginaError(): Pagina {
  return documento(
    "No se pudo abrir la autorización",
    null,
    html`
    <h1>No se pudo abrir la autorización</h1>
    <p>El enlace venció, ya se usó o no es válido. Vuelva a la aplicación desde la que llegó e inicie el ingreso otra vez.</p>`,
  );
}

export function paginaNoDisponible(): Pagina {
  return documento(
    "Autorización no disponible",
    null,
    html`
    <h1>Autorización no disponible</h1>
    <p>El servicio no puede completar la autorización en este momento. No se registró ninguna decisión. Inténtelo de nuevo en unos minutos.</p>`,
  );
}

// Tokens first, as on the policy sites: GCT by default, GLT overrides what differs.
export const ESTILOS = `
:root {
  --marca: #2a4499;
  --marca-oscura: #001871;
  --tinta: #1b2436;
  --tenue: #5b6472;
  --linea: #d8dce4;
  --fondo: #e7eaf0;
  --hoja: #ffffff;
  --peligro: #b3261e;
  --radio: 8px;
  --espacio: 16px;
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
  font-size: 16px;
  line-height: 1.55;
}
.hoja {
  max-width: 760px;
  margin: 0 auto;
  padding: calc(var(--espacio) * 2) var(--espacio);
  background: var(--hoja);
  min-height: 100vh;
}
h1 { margin: 0 0 var(--espacio); color: var(--marca-oscura); font-size: 24px; line-height: 1.25; }
a { color: var(--marca-oscura); }
.aviso {
  max-height: 45vh;
  overflow-y: auto;
  margin: var(--espacio) 0;
  padding: var(--espacio);
  border: 1px solid var(--linea);
  border-radius: var(--radio);
  font-size: 14px;
}
.aviso h2 { margin: var(--espacio) 0 8px; font-size: 16px; color: var(--marca-oscura); }
.aviso h2:first-child { margin-top: 0; }
.casilla {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: var(--espacio) 0;
  cursor: pointer;
}
.casilla input { flex: none; width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--marca-oscura); }
.acciones { display: flex; flex-wrap: wrap; gap: 12px; }
button {
  min-height: 44px;
  padding: 0 24px;
  border-radius: var(--radio);
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.primaria { border: 1px solid var(--marca-oscura); background: var(--marca-oscura); color: var(--hoja); }
.secundaria { border: 1px solid var(--linea); background: var(--hoja); color: var(--tinta); }
button:focus-visible, a:focus-visible, .aviso:focus-visible, input:focus-visible {
  outline: 2px solid var(--marca);
  outline-offset: 2px;
}
.error { color: var(--peligro); font-weight: 600; }
.nota { margin: var(--espacio) 0 0; color: var(--tenue); font-size: 14px; }
`;
