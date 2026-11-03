/**
 * Table of contents derived from a legal source.
 *
 * The sources come from Pandoc, which writes every heading as
 * `<h2 id="…">N. TITLE</h2>` (subsections as `N.M TITLE`). Deriving the index
 * from them keeps it out of the fingerprinted text and always in step with it.
 * Headings without a number (the change-log title) are not listed.
 */

export interface EntradaIndice {
  id: string;
  numero: string;
  etiqueta: string;
  /** 0 for a section, 1 for a subsection. */
  profundidad: 0 | 1;
}

/** How the labels are written: the policy in title case, the notice in sentence case. */
export type EstiloEtiqueta = "titulo" | "oracion";

const ENCABEZADO = /<h2 id="([^"]+)">\s*([^<]*?)\s*<\/h2>/g;
const NUMERADO = /^(\d+(?:\.\d+)?)\.?\s+(.+)$/;

/**
 * Title case as the original site wrote it: lower case, then upper case at
 * the start and after a space, a period or a slash, so "S.A.S." and "Y/O"
 * survive.
 */
const enTitulo = (texto: string) =>
  texto.toLocaleLowerCase("es").replace(/(^|[\s./])(\p{L})/gu, (_, antes, letra) => antes + letra.toLocaleUpperCase("es"));

const enOracion = (texto: string) => {
  const minusculas = texto.toLocaleLowerCase("es");
  return minusculas.charAt(0).toLocaleUpperCase("es") + minusculas.slice(1);
};

export function indiceDe(fuente: string, estilo: EstiloEtiqueta): EntradaIndice[] {
  const entradas: EntradaIndice[] = [];
  for (const [, id, texto] of fuente.matchAll(ENCABEZADO)) {
    const numerado = texto.match(NUMERADO);
    if (!numerado) continue;
    const [, numero, titulo] = numerado;
    entradas.push({
      id,
      numero,
      etiqueta: estilo === "titulo" ? enTitulo(titulo) : enOracion(titulo),
      profundidad: numero.includes(".") ? 1 : 0,
    });
  }
  return entradas;
}
