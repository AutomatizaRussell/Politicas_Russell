/**
 * A "part" is one legal document as the page shows it: banner, index and
 * verbatim source. The home page shows both in-force documents; a frozen
 * version page (/v/<tipo>/<version>/) shows only that one.
 */
import type { Entidad, TipoDocumento } from "../entidades";
import { indiceDe, type EntradaIndice } from "./indice";
import type { VersionPublicada } from "./versiones";

export interface Parte {
  tipo: TipoDocumento;
  /** Section id kept from the original site, so existing anchors still work. */
  idSeccion: string;
  etiqueta: string;
  banner: string;
  altBanner: string;
  indice: EntradaIndice[];
  version: VersionPublicada;
}

const ID_SECCION: Record<TipoDocumento, string> = {
  "politica-tratamiento": "politica",
  "aviso-privacidad": "aviso",
};

// Banner images, emitted by Vite with hashed names. Path keys are relative to
// the project root, as in versiones.ts.
const banners = import.meta.glob<string>("/contenido/*/banner-*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

export function parteDe(entidad: Entidad, version: VersionPublicada): Parte {
  const banner = banners[`/contenido/${entidad.codigo}/banner-${version.tipo}.png`];
  if (!banner) throw new Error(`Missing banner contenido/${entidad.codigo}/banner-${version.tipo}.png`);
  return {
    tipo: version.tipo,
    idSeccion: ID_SECCION[version.tipo],
    etiqueta: entidad.etiquetaIndice[version.tipo],
    banner,
    altBanner: entidad.altBanner[version.tipo],
    indice: indiceDe(version.fuente, version.tipo === "politica-tratamiento" ? "titulo" : "oracion"),
    version,
  };
}
