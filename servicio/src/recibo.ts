// The service's own signature (contract §4.5). A project verifies a receipt
// offline with the published public keys, so a receipt stays verifiable as proof
// even when this service is down or its database is lost.

import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from "jose";
import type { CodigoEntidad } from "./manifiesto.ts";

// Limits the transport of the receipt, not the validity of the authorization.
const VIDA_RECIBO_S = 600;

export const ALGORITMO = "ES256";

export interface DocumentoMostrado {
  tipo: string;
  version: number;
  sha256: string;
}

export interface Firmante {
  firmarRecibo(datos: DatosRecibo): Promise<string>;
  /** Public keys for GET /.well-known/jwks.json: active key plus retired ones. */
  jwks(): { keys: JWK[] };
}

export interface DatosRecibo {
  proyecto: string;
  sujeto: string;
  jti: string;
  resultado: "aceptada" | "rechazada";
  entidad: { codigo: CodigoEntidad; nit: string };
  documentos: DocumentoMostrado[];
  identidad: string;
  registradaEn: string;
  state: string;
}

/** Keeps only the public members of an EC key, never `d`. */
function publica(jwk: JWK): JWK {
  const { kty, crv, x, y, kid } = jwk;
  return { kty, crv, x, y, kid, alg: ALGORITMO, use: "sig" };
}

export async function crearFirmante(opciones: {
  llavePrivada: JWK;
  llavesRetiradas?: JWK[];
  urlServicio: string;
}): Promise<Firmante> {
  const { llavePrivada, urlServicio } = opciones;
  if (!llavePrivada.kid || !llavePrivada.d) {
    throw new Error("La llave de recibos debe ser privada y traer kid");
  }
  const kid = llavePrivada.kid;
  const llave = await importJWK(llavePrivada, ALGORITMO);
  const publicas = [publica(llavePrivada), ...(opciones.llavesRetiradas ?? []).map(publica)];

  return {
    firmarRecibo(datos) {
      return new SignJWT({
        resultado: datos.resultado,
        entidad: datos.entidad,
        documentos: datos.documentos,
        identidad: datos.identidad,
        registradaEn: datos.registradaEn,
        state: datos.state,
      })
        .setProtectedHeader({ alg: ALGORITMO, kid, typ: "JWT" })
        .setIssuer(urlServicio)
        .setAudience(datos.proyecto)
        .setSubject(datos.sujeto)
        .setJti(datos.jti)
        .setIssuedAt()
        .setExpirationTime(`${VIDA_RECIBO_S}s`)
        .sign(llave);
    },
    jwks: () => ({ keys: publicas }),
  };
}

/** Produces a new private JWK for RECIBO_LLAVE_PRIVADA or a project's key pair. */
export async function generarLlave(kid: string): Promise<JWK> {
  const { privateKey } = await generateKeyPair(ALGORITMO, { extractable: true });
  return { ...(await exportJWK(privateKey)), kid, alg: ALGORITMO };
}
