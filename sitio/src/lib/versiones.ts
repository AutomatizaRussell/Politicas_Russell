/**
 * Published versions of each legal document, read and checked at build time.
 *
 * Sources live in `contenido/<entidad>/<tipo>/<version>.html`: the HTML
 * fragment that Pandoc produced from the approved Word document, kept as-is.
 * Each one is registered in `contenido/<entidad>/versiones.json` with the
 * SHA-256 of its canonical form (contract §3.3, §3.4).
 *
 * The build recomputes every fingerprint and throws on any mismatch, so a
 * published version cannot be edited silently: changing the legal text
 * requires registering a new version with `pnpm registrar-version`.
 */
import { createHash } from "node:crypto";
import type { CodigoEntidad, TipoDocumento } from "../entidades";
import { canonicalizar } from "./canonico.mjs";

export interface VersionRegistrada {
  tipo: TipoDocumento;
  version: number;
  /** Date the version takes legal effect, AAAA-MM-DD (its own change log). */
  vigenteDesde: string;
  sha256: string;
  /** Date the version entered this site, AAAA-MM-DD. */
  publicadaEn: string;
}

export interface VersionPublicada extends VersionRegistrada {
  /** Canonical source: exactly the bytes the fingerprint covers. */
  fuente: string;
}

// Vite inlines every source and registry at build time. Paths starting with
// "/" are relative to the project root (sitio/), not to this file.
const fuentes = import.meta.glob<string>("/contenido/*/*/*.html", {
  eager: true,
  query: "?raw",
  import: "default",
});
const registros = import.meta.glob<{ versiones: VersionRegistrada[] }>("/contenido/*/versiones.json", {
  eager: true,
  import: "default",
});

export const huella = (texto: string): string => createHash("sha256").update(texto, "utf8").digest("hex");

/**
 * Every registered version of one entity, each with its verified source.
 * Throws when a source is missing, unregistered or does not match its
 * fingerprint.
 */
export function versionesDe(entidad: CodigoEntidad): VersionPublicada[] {
  const registro = registros[`/contenido/${entidad}/versiones.json`];
  if (!registro) throw new Error(`Missing contenido/${entidad}/versiones.json`);

  const publicadas = registro.versiones.map((v) => {
    const ruta = `/contenido/${entidad}/${v.tipo}/${v.version}.html`;
    const cruda = fuentes[ruta];
    if (cruda === undefined) throw new Error(`Registered version without source: ${ruta}`);
    const fuente = canonicalizar(cruda);
    const calculada = huella(fuente);
    if (calculada !== v.sha256) {
      throw new Error(
        `${ruta} does not match its registered fingerprint (registered ${v.sha256}, computed ${calculada}). ` +
          "A published version is immutable: register a new version instead of editing this file.",
      );
    }
    return { ...v, fuente };
  });

  // A source file nobody registered would be served nowhere and hashed by
  // nobody; treat it as an error rather than ignoring it.
  for (const ruta of Object.keys(fuentes).filter((r) => r.startsWith(`/contenido/${entidad}/`))) {
    const [, , , tipo, archivo] = ruta.split("/");
    const version = Number(archivo.replace(/\.html$/, ""));
    if (!publicadas.some((p) => p.tipo === tipo && p.version === version)) {
      throw new Error(`Source without a registered version: ${ruta}`);
    }
  }
  return publicadas;
}

/** The in-force version of each document type: the highest registered one. */
export function vigentesDe(entidad: CodigoEntidad): Record<TipoDocumento, VersionPublicada> {
  const vigentes = {} as Record<TipoDocumento, VersionPublicada>;
  for (const v of versionesDe(entidad)) {
    if (!vigentes[v.tipo] || v.version > vigentes[v.tipo].version) vigentes[v.tipo] = v;
  }
  for (const tipo of ["politica-tratamiento", "aviso-privacidad"] as const) {
    if (!vigentes[tipo]) throw new Error(`${entidad} has no registered version of ${tipo}`);
  }
  return vigentes;
}
