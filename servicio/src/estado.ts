// Contract §4.6: the state of a subject for one document, derived from evidence.
// Only the latest relevant event counts, so accepting again after a revocation or
// a rejection restores the authorization without rewriting any record.

import type { EventoSujeto } from "./registro.ts";

export type Estado = "vigente" | "desactualizada" | "revocada" | "rechazada" | "ninguna";

export interface EstadoDocumento {
  tipo: string;
  estado: Estado;
  versionVigente: number;
  versionAceptada?: number;
}

/**
 * A revocation covers the whole entity, so it applies to every document. An
 * acceptance or rejection only counts for the documents it actually showed.
 */
export function estadoDe(eventos: EventoSujeto[], tipo: string, versionVigente: number): EstadoDocumento {
  // `eventos` comes oldest first.
  for (let i = eventos.length - 1; i >= 0; i--) {
    const evento = eventos[i]!;
    if (evento.clase === "revocacion") return { tipo, estado: "revocada", versionVigente };

    const documento = evento.documentos.find((d) => d.tipo === tipo);
    if (!documento) continue;
    if (evento.clase === "rechazo") return { tipo, estado: "rechazada", versionVigente };

    return {
      tipo,
      estado: documento.version === versionVigente ? "vigente" : "desactualizada",
      versionVigente,
      versionAceptada: documento.version,
    };
  }
  return { tipo, estado: "ninguna", versionVigente };
}
