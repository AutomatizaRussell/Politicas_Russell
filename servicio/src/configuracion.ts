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

/**
 * JSON.parse quotes part of its input in the error message, which for a private
 * key would end up in the deployment logs. Only the variable's name is reported.
 */
function jsonDe<T>(nombre: string, valor: string): T {
  try {
    return JSON.parse(valor) as T;
  } catch {
    throw new Error(`La variable de entorno ${nombre} no es JSON válido`);
  }
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
    llavePrivada: jsonDe<JWK>("RECIBO_LLAVE_PRIVADA", obligatoria("RECIBO_LLAVE_PRIVADA")),
    llavesRetiradas: jsonDe<JWK[]>("RECIBO_LLAVES_RETIRADAS", process.env["RECIBO_LLAVES_RETIRADAS"] || "[]"),
    puerto: Number(process.env["PUERTO"] || 3000),
  };
}
