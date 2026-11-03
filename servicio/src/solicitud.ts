// Verifies what a project signs: acceptance requests (contract §4.3) and API
// assertions (§4.6). Every failure is the same ErrorSolicitud: the cause goes to
// the log, and the person only sees a generic page that never redirects.

import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify, type JWTPayload } from "jose";
import type { Db } from "./db.ts";
import { ALGORITMO } from "./recibo.ts";
import { obtenerLlaveActiva, obtenerProyecto, solicitudUsada, type Proyecto } from "./registro.ts";

export class ErrorSolicitud extends Error {
  readonly codigo: string;
  readonly proyecto: string | undefined;

  constructor(codigo: string, proyecto?: string) {
    super(codigo);
    this.codigo = codigo;
    this.proyecto = proyecto;
  }
}

const VIDA_MAXIMA_SOLICITUD_S = 300;
const VIDA_MAXIMA_ASERCION_S = 60;
const TOLERANCIA_RELOJ_S = 30;
const LARGO_MAXIMO_STATE = 1024;

const CORREO_NORMALIZADO = /^[^\s@A-Z]+@[^\s@A-Z]+\.[^\s@A-Z]+$/;

export function esCorreoNormalizado(correo: unknown): correo is string {
  return typeof correo === "string" && correo.length <= 254 && CORREO_NORMALIZADO.test(correo);
}

/**
 * Checks signature, issuer, audience and lifetime against a key of the project
 * named by the token. The token names its own issuer, which is only trusted once
 * the signature verifies with a key registered for that very project.
 */
async function verificarFirmaDeProyecto(
  db: Db,
  token: string,
  audiencia: string,
  vidaMaximaS: number,
): Promise<{ proyecto: Proyecto; claims: JWTPayload }> {
  let iss: string | undefined;
  let kid: string | undefined;
  try {
    iss = decodeJwt(token).iss;
    kid = decodeProtectedHeader(token).kid;
  } catch {
    throw new ErrorSolicitud("token-ilegible");
  }
  if (!iss || !kid) throw new ErrorSolicitud("token-incompleto", iss);

  const proyecto = await obtenerProyecto(db, iss);
  if (!proyecto || !proyecto.activo) throw new ErrorSolicitud("proyecto-desconocido", iss);
  if (proyecto.clase !== "confidencial") throw new ErrorSolicitud("clase-no-disponible", iss);

  const jwk = await obtenerLlaveActiva(db, proyecto.id, kid);
  if (!jwk) throw new ErrorSolicitud("llave-desconocida", proyecto.id);

  let claims: JWTPayload;
  try {
    const verificado = await jwtVerify(token, await importJWK(jwk, ALGORITMO), {
      algorithms: [ALGORITMO],
      issuer: proyecto.id,
      audience: audiencia,
      clockTolerance: TOLERANCIA_RELOJ_S,
      requiredClaims: ["iat", "exp"],
    });
    claims = verificado.payload;
  } catch {
    throw new ErrorSolicitud("firma-o-vigencia-invalida", proyecto.id);
  }
  // A project could sign a long-lived token; the contract bounds it regardless.
  if (claims.exp! - claims.iat! > vidaMaximaS) {
    throw new ErrorSolicitud("vida-excesiva", proyecto.id);
  }
  return { proyecto, claims };
}

export interface SolicitudValida {
  proyecto: Proyecto;
  sujeto: string;
  nombre: string | null;
  regreso: string;
  state: string;
  jti: string;
  expira: Date;
}

/** Validates an acceptance request; both GET and POST call this on the same token. */
export async function verificarSolicitud(db: Db, token: string, urlServicio: string): Promise<SolicitudValida> {
  const { proyecto, claims } = await verificarFirmaDeProyecto(db, token, urlServicio, VIDA_MAXIMA_SOLICITUD_S);
  const { sub, regreso, state, jti, nombre } = claims;

  if (!esCorreoNormalizado(sub)) throw new ErrorSolicitud("sujeto-invalido", proyecto.id);
  // Exact comparison, no wildcards: this is what stops an open redirect.
  if (typeof regreso !== "string" || !proyecto.regresos.includes(regreso)) {
    throw new ErrorSolicitud("regreso-no-permitido", proyecto.id);
  }
  if (typeof state !== "string" || state.length === 0 || state.length > LARGO_MAXIMO_STATE) {
    throw new ErrorSolicitud("state-invalido", proyecto.id);
  }
  if (typeof jti !== "string" || jti.length === 0) throw new ErrorSolicitud("jti-ausente", proyecto.id);
  if (await solicitudUsada(db, proyecto.id, jti)) throw new ErrorSolicitud("solicitud-usada", proyecto.id);

  return {
    proyecto,
    sujeto: sub,
    nombre: typeof nombre === "string" ? nombre : null,
    regreso,
    state,
    jti,
    expira: new Date(claims.exp! * 1000),
  };
}

/** Validates the bearer assertion of an API call and returns the calling project. */
export async function verificarAsercion(db: Db, token: string, urlServicio: string): Promise<Proyecto> {
  const { proyecto } = await verificarFirmaDeProyecto(db, token, `${urlServicio}/api`, VIDA_MAXIMA_ASERCION_S);
  return proyecto;
}
