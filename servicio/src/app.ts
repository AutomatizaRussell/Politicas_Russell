// HTTP surface of the service (contract §4). Dependencies are injected so the
// tests run this same application over PGlite and a fake manifest.

import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import type { Db } from "./db.ts";
import { estadoDe } from "./estado.ts";
import { crearLimitador, type Limite, type Limitador } from "./limites.ts";
import type { FuenteManifiestos, Manifiesto } from "./manifiesto.ts";
import { reducirAgente } from "./navegador.ts";
import type { DocumentoMostrado, Firmante } from "./recibo.ts";
import { eventosDe, registrarResultado, revocacionesDesde, SolicitudRepetida, type Proyecto } from "./registro.ts";
import { ErrorSolicitud, esCorreoNormalizado, verificarAsercion, verificarSolicitud, type SolicitudValida } from "./solicitud.ts";
import { ESTILOS, paginaAceptacion, paginaError, paginaNoDisponible } from "./vistas.ts";

export interface Dependencias {
  db: Db;
  manifiestos: FuenteManifiestos;
  firmante: Firmante;
  urlServicio: string;
  limitador?: Limitador;
  registrar?: (evento: Record<string, unknown>) => void;
}

const MINUTO = 60_000;
const LIMITE_PROYECTO: Limite = { maximo: 600, ventanaMs: MINUTO };
const LIMITE_SUJETO: Limite = { maximo: 20, ventanaMs: 10 * MINUTO };

// The name prefix makes browsers require Secure, Path=/ and no Domain.
const COOKIE_CSRF = "__Host-csrf";

/**
 * Strict policy for every page: only this origin's stylesheet, never framed.
 * Browsers also apply form-action to redirects after a submission, so the
 * acceptance form has to allow the project's return origin or the 303 is blocked.
 */
function politicaContenido(origenRegreso?: string): string {
  return [
    "default-src 'none'",
    "style-src 'self'",
    "base-uri 'none'",
    `form-action 'self'${origenRegreso ? ` ${origenRegreso}` : ""}`,
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Resolves the documents the project requires, as the manifest publishes them. */
function documentosExigidos(proyecto: Proyecto, manifiesto: Manifiesto): DocumentoMostrado[] {
  return proyecto.documentos.map((tipo) => {
    const vigente = manifiesto.vigentes[tipo];
    if (!vigente) throw new Error(`El manifiesto de ${proyecto.entidad} no publica ${tipo}`);
    return { tipo, version: vigente.version, sha256: vigente.sha256 };
  });
}

export function crearApp(deps: Dependencias) {
  const { db, manifiestos, firmante, urlServicio } = deps;
  const limitador = deps.limitador ?? crearLimitador();
  const registrar = deps.registrar ?? ((evento) => console.log(JSON.stringify(evento)));
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    // Receipts travel in URLs: nothing here may leak its address to another site.
    c.header("Referrer-Policy", "no-referrer");
    if (!c.res.headers.has("Content-Security-Policy")) c.header("Content-Security-Policy", politicaContenido());
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  });

  app.use("/aceptar", bodyLimit({ maxSize: 64 * 1024 }));

  // Never redirects: an invalid parameter must not take anyone anywhere (§4.10).
  app.onError((error, c) => {
    if (error instanceof ErrorSolicitud) {
      registrar({ evento: "solicitud-rechazada", codigo: error.codigo, proyecto: error.proyecto });
      return c.html(paginaError(), 400);
    }
    registrar({ evento: "error", mensaje: error.message });
    // API clients are programs: they get a status they can parse, not a page.
    if (c.req.path.startsWith("/api/")) return c.json({ error: "no-disponible" }, 503);
    return c.html(paginaNoDisponible(), 503);
  });

  app.get("/salud", async (c) => {
    await db.consulta("SELECT 1");
    return c.text("ok");
  });

  app.get("/estilos.css", (c) => {
    c.header("Content-Type", "text/css; charset=utf-8");
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(ESTILOS);
  });

  app.get("/.well-known/jwks.json", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    c.header("Access-Control-Allow-Origin", "*");
    return c.json(firmante.jwks());
  });

  /** Renders the screen for a request already validated. */
  async function responderPantalla(
    c: Context,
    solicitud: SolicitudValida,
    token: string,
    csrf: string,
    faltaCasilla: boolean,
  ) {
    const { proyecto } = solicitud;
    const manifiesto = await manifiestos.manifiesto(proyecto.entidad);
    documentosExigidos(proyecto, manifiesto);
    const aviso = proyecto.documentos.includes("aviso-privacidad")
      ? await manifiestos.fuente(manifiesto.vigentes["aviso-privacidad"]!)
      : null;

    c.header("Content-Security-Policy", politicaContenido(new URL(solicitud.regreso).origin));
    return c.html(
      paginaAceptacion({
        manifiesto,
        nombreProyecto: proyecto.nombre,
        sujeto: solicitud.sujeto,
        documentos: proyecto.documentos,
        avisoHtml: aviso,
        solicitud: token,
        csrf,
        faltaCasilla,
      }),
      faltaCasilla ? 422 : 200,
    );
  }

  function verificarLimites(solicitud: SolicitudValida): void {
    const dentro =
      limitador.permitir(`proyecto:${solicitud.proyecto.id}`, LIMITE_PROYECTO) &&
      limitador.permitir(`sujeto:${solicitud.proyecto.entidad}:${solicitud.sujeto}`, LIMITE_SUJETO);
    if (!dentro) throw new ErrorSolicitud("limite-excedido", solicitud.proyecto.id);
  }

  app.get("/aceptar", async (c) => {
    const token = c.req.query("solicitud");
    if (!token) throw new ErrorSolicitud("solicitud-ausente");

    const solicitud = await verificarSolicitud(db, token, urlServicio);
    verificarLimites(solicitud);

    // Double-submit token. An existing cookie is reused so that a second open tab
    // does not invalidate the form of the first one.
    const csrf = getCookie(c, COOKIE_CSRF) ?? randomUUID();
    setCookie(c, COOKIE_CSRF, csrf, { httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
    return responderPantalla(c, solicitud, token, csrf, false);
  });

  app.post("/aceptar", async (c) => {
    const cuerpo = await c.req.parseBody();
    const token = cuerpo["solicitud"];
    if (typeof token !== "string") throw new ErrorSolicitud("solicitud-ausente");

    const csrf = cuerpo["csrf"];
    if (typeof csrf !== "string" || csrf !== getCookie(c, COOKIE_CSRF)) {
      throw new ErrorSolicitud("csrf-invalido");
    }

    // Re-validated in full: the form field is input like any other.
    const solicitud = await verificarSolicitud(db, token, urlServicio);
    verificarLimites(solicitud);

    const decision = cuerpo["decision"];
    if (decision !== "aceptar" && decision !== "rechazar") throw new ErrorSolicitud("decision-invalida", solicitud.proyecto.id);
    if (decision === "aceptar" && cuerpo["casilla"] !== "si") {
      return responderPantalla(c, solicitud, token, csrf, true);
    }

    const { proyecto } = solicitud;
    const manifiesto = await manifiestos.manifiesto(proyecto.entidad);
    const documentos = documentosExigidos(proyecto, manifiesto);
    // What is recorded must be what could be shown: this fails if the source of the
    // notice no longer matches its fingerprint.
    if (proyecto.documentos.includes("aviso-privacidad")) {
      await manifiestos.fuente(manifiesto.vigentes["aviso-privacidad"]!);
    }

    const resultado = decision === "aceptar" ? "aceptada" : "rechazada";
    const identidad = "verificada-por-proyecto";
    let registro: { id: string; registradaEn: string };
    try {
      registro = await registrarResultado(db, {
        proyecto,
        manifiesto,
        sujeto: solicitud.sujeto,
        nombre: solicitud.nombre,
        jtiSolicitud: solicitud.jti,
        expiraSolicitud: solicitud.expira,
        resultado,
        documentos,
        identidad,
        navegador: reducirAgente(c.req.header("User-Agent")),
      });
    } catch (error) {
      // Two simultaneous submissions: the transaction lets exactly one through.
      if (error instanceof SolicitudRepetida) throw new ErrorSolicitud("solicitud-usada", proyecto.id);
      throw error;
    }

    const recibo = await firmante.firmarRecibo({
      proyecto: proyecto.id,
      sujeto: solicitud.sujeto,
      jti: registro.id,
      resultado,
      entidad: { codigo: manifiesto.entidad.codigo, nit: manifiesto.entidad.nit },
      documentos,
      identidad,
      registradaEn: registro.registradaEn,
      state: solicitud.state,
    });

    const destino = new URL(solicitud.regreso);
    destino.searchParams.set("recibo", recibo);
    destino.searchParams.set("state", solicitud.state);
    return c.redirect(destino.toString(), 303);
  });

  /** Authenticates an API call; a failure answers 401 with no detail. */
  async function proyectoDeLaLlamada(c: Context): Promise<Proyecto | null> {
    const cabecera = c.req.header("Authorization");
    if (!cabecera?.startsWith("Bearer ")) return null;
    try {
      const proyecto = await verificarAsercion(db, cabecera.slice("Bearer ".length), urlServicio);
      return limitador.permitir(`proyecto:${proyecto.id}`, LIMITE_PROYECTO) ? proyecto : null;
    } catch (error) {
      if (!(error instanceof ErrorSolicitud)) throw error;
      registrar({ evento: "asercion-rechazada", codigo: error.codigo, proyecto: error.proyecto });
      return null;
    }
  }

  app.get("/api/v1/estado", async (c) => {
    const proyecto = await proyectoDeLaLlamada(c);
    if (!proyecto) return c.json({ error: "no-autorizado" }, 401);

    const sujeto = c.req.query("sujeto");
    if (!esCorreoNormalizado(sujeto)) return c.json({ error: "sujeto-invalido" }, 400);

    const manifiesto = await manifiestos.manifiesto(proyecto.entidad);
    const eventos = await eventosDe(db, proyecto.entidad, sujeto);
    return c.json({
      sujeto,
      entidad: proyecto.entidad,
      documentos: documentosExigidos(proyecto, manifiesto).map((d) => estadoDe(eventos, d.tipo, d.version)),
    });
  });

  app.get("/api/v1/revocaciones", async (c) => {
    const proyecto = await proyectoDeLaLlamada(c);
    if (!proyecto) return c.json({ error: "no-autorizado" }, 401);

    const desde = c.req.query("desde") ?? "0";
    if (!/^\d{1,18}$/.test(desde)) return c.json({ error: "cursor-invalido" }, 400);
    return c.json(await revocacionesDesde(db, proyecto.entidad, desde));
  });

  return app;
}
