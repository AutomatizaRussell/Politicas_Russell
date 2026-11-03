// Reads what each policy site publishes (contract §3.6). The site is the only
// authority on the legal text: the service keeps nothing of it in the repository
// and refuses to show a source whose fingerprint differs from the manifest, so
// what a receipt declares as shown is what was actually shown.

import { createHash } from "node:crypto";

export type CodigoEntidad = "gct" | "glt";

export const ENTIDADES: readonly CodigoEntidad[] = ["gct", "glt"];

export interface DocumentoVigente {
  version: number;
  vigenteDesde: string;
  sha256: string;
  url: string;
  fuente: string;
}

export interface Manifiesto {
  formato: number;
  entidad: {
    codigo: CodigoEntidad;
    razonSocial: string;
    nit: string;
    correoNotificaciones: string;
  };
  vigentes: Record<string, DocumentoVigente>;
  historial: { tipo: string; version: number; vigenteDesde: string; sha256: string }[];
}

export interface FuenteManifiestos {
  manifiesto(entidad: CodigoEntidad): Promise<Manifiesto>;
  /** Returns the legal source of a document after verifying its fingerprint. */
  fuente(documento: DocumentoVigente): Promise<string>;
}

// Contract §4.8 lets a manifest be cached for up to one hour.
const VIGENCIA_CACHE_MS = 60 * 60 * 1000;

export function crearManifiestos(opciones: {
  urls: Record<CodigoEntidad, string>;
  fetch?: typeof fetch;
  ahora?: () => number;
}): FuenteManifiestos {
  const traer = opciones.fetch ?? fetch;
  const ahora = opciones.ahora ?? Date.now;
  const manifiestos = new Map<CodigoEntidad, { valor: Manifiesto; leidoEn: number }>();
  // Keyed by fingerprint: a published source never changes, so this never expires.
  const fuentes = new Map<string, string>();

  return {
    async manifiesto(entidad) {
      const enCache = manifiestos.get(entidad);
      if (enCache && ahora() - enCache.leidoEn < VIGENCIA_CACHE_MS) return enCache.valor;

      const respuesta = await traer(opciones.urls[entidad]);
      if (!respuesta.ok) throw new Error(`Manifiesto de ${entidad}: HTTP ${respuesta.status}`);
      const valor = (await respuesta.json()) as Manifiesto;
      if (valor.formato !== 1 || valor.entidad?.codigo !== entidad) {
        throw new Error(`Manifiesto de ${entidad}: formato o entidad inesperados`);
      }
      manifiestos.set(entidad, { valor, leidoEn: ahora() });
      return valor;
    },

    async fuente(documento) {
      const enCache = fuentes.get(documento.sha256);
      if (enCache !== undefined) return enCache;

      const respuesta = await traer(documento.fuente);
      if (!respuesta.ok) throw new Error(`Fuente ${documento.fuente}: HTTP ${respuesta.status}`);
      const texto = await respuesta.text();
      const huella = createHash("sha256").update(texto, "utf8").digest("hex");
      if (huella !== documento.sha256) {
        throw new Error(`Fuente ${documento.fuente}: la huella no coincide con el manifiesto`);
      }
      fuentes.set(documento.sha256, texto);
      return texto;
    },
  };
}
