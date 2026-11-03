// Reads the deployment environment and fails at startup, not on the first
// request, when something required is missing. Secrets are never logged.

import type { JWK } from "jose";
import type { CodigoEntidad } from "./manifiesto.ts";

// Public addresses, already published in contract §2.
export const URLS_MANIFIESTO: Record<CodigoEntidad, string> = {
  gct: "https://conecta-gctpoliticas.rbgct.cloud/manifest.json",
  glt: "https://conecta-gltpoliticas.rbgct.cloud/manifest.json",
};

function obligatoria(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export function cadenaConexion(): string {
  return obligatoria("DATABASE_URL");
}

export function leerConfiguracion() {
  const urlServicio = obligatoria("URL_SERVICIO");
  if (!urlServicio.startsWith("https://") || urlServicio.endsWith("/")) {
    throw new Error("URL_SERVICIO debe usar https y no terminar en /");
  }
  return {
    urlServicio,
    llavePrivada: JSON.parse(obligatoria("RECIBO_LLAVE_PRIVADA")) as JWK,
    llavesRetiradas: JSON.parse(process.env["RECIBO_LLAVES_RETIRADAS"] || "[]") as JWK[],
    puerto: Number(process.env["PUERTO"] || 3000),
  };
}
