// End-to-end tests of the HTTP surface over PGlite, a real PostgreSQL compiled to
// WASM: signatures, SQL, constraints and triggers all run for real. Only the policy
// site is replaced, by an in-memory manifest. All data here is fictitious.

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWK } from "jose";
import { crearApp } from "../src/app.ts";
import { migrar, type Db } from "../src/db.ts";
import { crearManifiestos, type Manifiesto } from "../src/manifiesto.ts";
import { crearFirmante, generarLlave } from "../src/recibo.ts";
import { agregarLlave, guardarProyecto, registrarRevocacion, retirarLlave } from "../src/registro.ts";

const URL_SERVICIO = "https://consentimiento.example.org";
const REGRESO = "https://app.example.org/consentimiento?origen=portal";
const SUJETO = "titular@example.com";
const AVISO = "<h2>1. Responsable</h2><p>Texto del aviso de prueba.</p>\n";

const sha = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");

function dbDePrueba(pg: PGlite): Db {
  const envolver = (c: Pick<PGlite, "query" | "exec">): Omit<Db, "transaccion"> => ({
    async consulta<T>(sql: string, parametros: unknown[] = []) {
      return (await c.query<T>(sql, parametros as never[])).rows;
    },
    async script(sql) {
      await c.exec(sql);
    },
  });
  return {
    ...envolver(pg),
    transaccion: <T>(fn: (tx: Db) => Promise<T>) =>
      pg.transaction((tx) =>
        fn({
          ...envolver(tx as never),
          transaccion() {
            throw new Error("Las transacciones no se anidan");
          },
        }),
      ) as Promise<T>,
  };
}

function manifiestoDe(codigo: "gct" | "glt", version = 2, aviso = AVISO): Manifiesto {
  const documento = (tipo: string, texto: string) => ({
    version,
    vigenteDesde: "2025-09-15",
    sha256: sha(texto),
    url: `https://${codigo}.example.org/v/${tipo}/${version}/`,
    fuente: `https://${codigo}.example.org/v/${tipo}/${version}/fuente.html`,
  });
  const vigentes = {
    "aviso-privacidad": documento("aviso-privacidad", aviso),
    "politica-tratamiento": documento("politica-tratamiento", "politica"),
  };
  return {
    formato: 1,
    entidad: { codigo, razonSocial: `Entidad ${codigo}`, nit: "000.000.000-0", correoNotificaciones: "n@example.com" },
    vigentes,
    historial: Object.entries(vigentes).map(([tipo, d]) => ({
      tipo,
      version: d.version,
      vigenteDesde: d.vigenteDesde,
      sha256: d.sha256,
    })),
  };
}

interface Montaje {
  db: Db;
  pg: PGlite;
  app: ReturnType<typeof crearApp>;
  privada: CryptoKey;
  llavePublica: JWK;
  sitioCaido: { valor: boolean };
  jwks: { keys: JWK[] };
  sitio: { gct: Manifiesto; glt: Manifiesto; fuentes: Map<string, string> };
  publicar(version: number): void;
}

async function montar(): Promise<Montaje> {
  const pg = new PGlite();
  const db = dbDePrueba(pg);
  await migrar(db, fileURLToPath(new URL("../migraciones", import.meta.url)));

  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const llavePublica: JWK = { ...(await exportJWK(publicKey)), kid: "k1" };
  const sitioCaido = { valor: false };
  for (const [id, entidad] of [["app-gct", "gct"], ["app-glt", "glt"]] as const) {
    await guardarProyecto(db, {
      id,
      nombre: `Aplicación ${entidad}`,
      entidad,
      clase: "confidencial",
      documentos: ["aviso-privacidad", "politica-tratamiento"],
      regresos: [REGRESO],
    });
    await agregarLlave(db, id, llavePublica);
  }

  const sitio = { gct: manifiestoDe("gct"), glt: manifiestoDe("glt"), fuentes: new Map<string, string>() };
  const indexar = () => {
    for (const m of [sitio.gct, sitio.glt]) {
      sitio.fuentes.set(m.vigentes["aviso-privacidad"]!.fuente, AVISO);
      sitio.fuentes.set(m.vigentes["politica-tratamiento"]!.fuente, "politica");
    }
  };
  indexar();

  const falso = (async (url: string) => {
    if (sitioCaido.valor) return new Response("", { status: 502 });
    if (url.endsWith("gct/manifest.json")) return Response.json(sitio.gct);
    if (url.endsWith("glt/manifest.json")) return Response.json(sitio.glt);
    const fuente = sitio.fuentes.get(url);
    return fuente === undefined ? new Response("", { status: 404 }) : new Response(fuente);
  }) as typeof fetch;

  // Time moves only when a test publishes a version, to expire the manifest cache.
  let reloj = 0;
  const firmante = await crearFirmante({ llavePrivada: await generarLlave("recibos-1"), urlServicio: URL_SERVICIO });
  const app = crearApp({
    db,
    firmante,
    urlServicio: URL_SERVICIO,
    registrar: () => {},
    manifiestos: crearManifiestos({
      urls: { gct: "https://x/gct/manifest.json", glt: "https://x/glt/manifest.json" },
      fetch: falso,
      ahora: () => reloj,
    }),
  });

  return {
    db,
    pg,
    app,
    privada: privateKey,
    llavePublica,
    sitioCaido,
    jwks: firmante.jwks(),
    sitio,
    publicar(version) {
      sitio.gct = manifiestoDe("gct", version);
      indexar();
      reloj += 2 * 60 * 60 * 1000;
    },
  };
}

type Ajustes = { iss?: string; aud?: string; sub?: string; regreso?: string; vidaS?: number; kid?: string; jti?: string; expiradaS?: number };

function firmarSolicitud(m: Montaje, a: Ajustes = {}): Promise<string> {
  const iat = Math.floor(Date.now() / 1000) - (a.expiradaS ?? 0);
  return new SignJWT({ regreso: a.regreso ?? REGRESO, state: "estado-opaco", nombre: "Titular de Prueba" })
    .setProtectedHeader({ alg: "ES256", kid: a.kid ?? "k1" })
    .setIssuer(a.iss ?? "app-gct")
    .setAudience(a.aud ?? URL_SERVICIO)
    .setSubject(a.sub ?? SUJETO)
    .setJti(a.jti ?? randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + (a.vidaS ?? 300))
    .sign(m.privada);
}

function firmarAsercion(m: Montaje, a: Ajustes = {}): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer(a.iss ?? "app-gct")
    .setAudience(a.aud ?? `${URL_SERVICIO}/api`)
    .setIssuedAt(iat)
    .setExpirationTime(iat + (a.vidaS ?? 60))
    .sign(m.privada);
}

const abrir = (m: Montaje, token: string) => m.app.request(`/aceptar?solicitud=${encodeURIComponent(token)}`);

function enviar(m: Montaje, token: string, campos: Record<string, string>, csrf: string | null = "c1") {
  return m.app.request("/aceptar", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36",
      ...(csrf ? { Cookie: `__Host-csrf=${csrf}` } : {}),
    },
    body: new URLSearchParams({ solicitud: token, csrf: "c1", ...campos }),
  });
}

async function aceptar(m: Montaje, a: Ajustes = {}) {
  const respuesta = await enviar(m, await firmarSolicitud(m, a), { decision: "aceptar", casilla: "si" });
  assert.equal(respuesta.status, 303);
  return respuesta;
}

async function reciboDe(m: Montaje, respuesta: Response, proyecto = "app-gct") {
  const destino = new URL(respuesta.headers.get("Location")!);
  const { payload } = await jwtVerify(destino.searchParams.get("recibo")!, createLocalJWKSet(m.jwks), {
    issuer: URL_SERVICIO,
    audience: proyecto,
    algorithms: ["ES256"],
  });
  return { destino, payload };
}

async function estados(m: Montaje, iss = "app-gct", sujeto = SUJETO) {
  const respuesta = await m.app.request(`/api/v1/estado?sujeto=${encodeURIComponent(sujeto)}`, {
    headers: { Authorization: `Bearer ${await firmarAsercion(m, { iss })}` },
  });
  assert.equal(respuesta.status, 200);
  const cuerpo = (await respuesta.json()) as { documentos: { tipo: string; estado: string }[] };
  return cuerpo.documentos.map((d) => d.estado);
}

const contar = async (m: Montaje, tabla: string) =>
  Number((await m.db.consulta<{ n: string }>(`SELECT count(*)::text AS n FROM ${tabla}`))[0]!.n);

describe("servicio de consentimiento", () => {
  let m: Montaje;
  beforeEach(async () => {
    m = await montar();
  });

  it("muestra el aviso, el enlace a la política y la casilla sin marcar", async () => {
    const respuesta = await abrir(m, await firmarSolicitud(m));
    assert.equal(respuesta.status, 200);
    const pagina = await respuesta.text();
    assert.ok(pagina.includes("Texto del aviso de prueba."));
    assert.ok(pagina.includes("https://gct.example.org/v/politica-tratamiento/2/"));
    assert.match(pagina, /<input type="checkbox" name="casilla" value="si">/);
    assert.ok(!/checked/.test(pagina));
    assert.ok(pagina.includes(SUJETO), "muestra la cuenta que autoriza");
    // The policy is linked from inside the sentence being authorized.
    assert.match(pagina, /<label class="casilla">[\s\S]*política de tratamiento<\/a>\.[\s\S]*<\/label>/);

    const politica = respuesta.headers.get("Content-Security-Policy")!;
    assert.ok(politica.includes("img-src 'self'"));
    assert.ok(politica.includes("frame-ancestors 'none'"));
    assert.ok(politica.includes("form-action 'self' https://app.example.org"));
    assert.ok(respuesta.headers.get("Set-Cookie")!.includes("__Host-csrf="));
  });

  it("sirve el logo que la pantalla enlaza", async () => {
    const respuesta = await m.app.request("/logo.png");
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get("Content-Type"), "image/png");
    assert.ok((await respuesta.arrayBuffer()).byteLength > 0);
  });

  it("nunca redirige ante una solicitud inválida", async () => {
    const invalidas: Ajustes[] = [
      { regreso: "https://atacante.example.net/" },
      { regreso: "https://app.example.org/consentimiento" },
      { aud: "https://otro.example.org" },
      { iss: "proyecto-inexistente" },
      { kid: "desconocida" },
      { vidaS: 301 },
      { expiradaS: 600 },
      { sub: "Con.Mayusculas@example.com" },
    ];
    for (const ajustes of invalidas) {
      const respuesta = await abrir(m, await firmarSolicitud(m, ajustes));
      assert.equal(respuesta.status, 400, JSON.stringify(ajustes));
      assert.equal(respuesta.headers.get("Location"), null);
    }
    assert.equal((await m.app.request("/aceptar?solicitud=basura")).status, 400);
  });

  it("rechaza una firma hecha con otra llave", async () => {
    const otra = await generateKeyPair("ES256");
    const iat = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ regreso: REGRESO, state: "s" })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer("app-gct")
      .setAudience(URL_SERVICIO)
      .setSubject(SUJETO)
      .setJti("j")
      .setIssuedAt(iat)
      .setExpirationTime(iat + 60)
      .sign(otra.privateKey);
    assert.equal((await abrir(m, token)).status, 400);
  });

  it("deja de admitir una llave retirada", async () => {
    await retirarLlave(m.db, "app-gct", "k1");
    assert.equal((await abrir(m, await firmarSolicitud(m))).status, 400);
  });

  it("emite un recibo verificable con la llave publicada", async () => {
    const { destino, payload } = await reciboDe(m, await aceptar(m));
    assert.equal(destino.origin + destino.pathname, "https://app.example.org/consentimiento");
    assert.equal(destino.searchParams.get("origen"), "portal");
    assert.equal(destino.searchParams.get("state"), "estado-opaco");
    assert.equal(payload.sub, SUJETO);
    assert.equal(payload["resultado"], "aceptada");
    assert.equal(payload["identidad"], "verificada-por-proyecto");
    assert.deepEqual(payload["entidad"], { codigo: "gct", nit: "000.000.000-0" });
    assert.deepEqual(payload["documentos"], [
      { tipo: "aviso-privacidad", version: 2, sha256: sha(AVISO) },
      { tipo: "politica-tratamiento", version: 2, sha256: sha("politica") },
    ]);
    assert.ok(payload.exp! - payload.iat! <= 600);

    const [fila] = await m.db.consulta<{ navegador: string; nombre: string }>(
      "SELECT navegador, nombre FROM aceptacion WHERE id = $1",
      [payload.jti],
    );
    assert.equal(fila!.navegador, "Chrome / Windows");
    assert.equal(fila!.nombre, "Titular de Prueba");
  });

  it("no publica la parte privada de la llave", () => {
    assert.ok(m.jwks.keys.every((k) => k.d === undefined));
  });

  it("no acepta sin la casilla marcada y no consume la solicitud", async () => {
    const token = await firmarSolicitud(m);
    const respuesta = await enviar(m, token, { decision: "aceptar" });
    assert.equal(respuesta.status, 422);
    assert.equal(respuesta.headers.get("Location"), null);
    assert.ok((await respuesta.text()).includes("marque la casilla"));
    assert.equal(await contar(m, "aceptacion"), 0);

    assert.equal((await enviar(m, token, { decision: "aceptar", casilla: "si" })).status, 303);
  });

  it("exige el token CSRF", async () => {
    const token = await firmarSolicitud(m);
    assert.equal((await enviar(m, token, { decision: "aceptar", casilla: "si" }, null)).status, 400);
    assert.equal((await enviar(m, token, { decision: "aceptar", casilla: "si" }, "otro")).status, 400);
    assert.equal(await contar(m, "aceptacion"), 0);
  });

  it("no admite usar dos veces la misma solicitud", async () => {
    const token = await firmarSolicitud(m);
    assert.equal((await enviar(m, token, { decision: "aceptar", casilla: "si" })).status, 303);
    assert.equal((await enviar(m, token, { decision: "aceptar", casilla: "si" })).status, 400);
    assert.equal((await abrir(m, token)).status, 400);
    assert.equal(await contar(m, "aceptacion"), 1);
  });

  it("registra el rechazo con su recibo y sin autorizar nada", async () => {
    const respuesta = await enviar(m, await firmarSolicitud(m), { decision: "rechazar" });
    assert.equal(respuesta.status, 303);
    assert.equal((await reciboDe(m, respuesta)).payload["resultado"], "rechazada");
    assert.equal(await contar(m, "rechazo"), 1);
    assert.equal(await contar(m, "aceptacion"), 0);
    assert.deepEqual(await estados(m), ["rechazada", "rechazada"]);
  });

  it("no muestra ni registra un aviso cuya huella no coincide", async () => {
    m.sitio.fuentes.set(m.sitio.gct.vigentes["aviso-privacidad"]!.fuente, "texto alterado");
    const token = await firmarSolicitud(m);
    assert.equal((await abrir(m, token)).status, 503);
    assert.equal((await enviar(m, token, { decision: "aceptar", casilla: "si" })).status, 503);
    assert.equal(await contar(m, "aceptacion"), 0);
    assert.equal(await contar(m, "solicitud_usada"), 0);
  });

  it("recorre los estados de un sujeto", async () => {
    assert.deepEqual(await estados(m), ["ninguna", "ninguna"]);

    await aceptar(m);
    assert.deepEqual(await estados(m), ["vigente", "vigente"]);

    m.publicar(3);
    assert.deepEqual(await estados(m), ["desactualizada", "desactualizada"]);

    await aceptar(m);
    assert.deepEqual(await estados(m), ["vigente", "vigente"]);

    await registrarRevocacion(m.db, {
      entidad: "gct",
      correo: SUJETO,
      solicitadaEn: "2026-11-03",
      referencia: "correo de prueba",
      operador: "operador@example.com",
    });
    assert.deepEqual(await estados(m), ["revocada", "revocada"]);

    await aceptar(m);
    assert.deepEqual(await estados(m), ["vigente", "vigente"]);
  });

  it("no comparte autorizaciones entre entidades", async () => {
    await aceptar(m);
    assert.deepEqual(await estados(m, "app-gct"), ["vigente", "vigente"]);
    assert.deepEqual(await estados(m, "app-glt"), ["ninguna", "ninguna"]);
  });

  it("cuenta la aceptación hecha desde otro proyecto de la misma entidad", async () => {
    await guardarProyecto(m.db, {
      id: "otra-gct",
      nombre: "Otra",
      entidad: "gct",
      clase: "confidencial",
      documentos: ["aviso-privacidad"],
      regresos: [REGRESO],
    });
    await agregarLlave(m.db, "otra-gct", m.llavePublica);
    await aceptar(m);
    const [fila] = await m.db.consulta<{ n: string }>("SELECT count(*)::text AS n FROM aceptacion WHERE proyecto_id = 'app-gct'");
    assert.equal(fila!.n, "1");
    // The acceptance came from app-gct; the authorization is granted to the entity (§2).
    assert.deepEqual(await estados(m, "otra-gct"), ["vigente"]);
  });

  it("responde JSON en la API cuando el sitio de políticas no está disponible", async () => {
    m.publicar(2);
    m.sitioCaido.valor = true;
    const respuesta = await m.app.request(`/api/v1/estado?sujeto=${SUJETO}`, {
      headers: { Authorization: `Bearer ${await firmarAsercion(m)}` },
    });
    assert.equal(respuesta.status, 503);
    assert.deepEqual(await respuesta.json(), { error: "no-disponible" });
  });

  it("entrega las revocaciones por cursor y solo las de la entidad", async () => {
    for (const [entidad, correo] of [["gct", "a@example.com"], ["glt", "b@example.com"], ["gct", "c@example.com"]] as const) {
      await registrarRevocacion(m.db, { entidad, correo, solicitadaEn: "2026-11-03", referencia: "r", operador: "o" });
    }
    const pedir = async (desde: string) => {
      const respuesta = await m.app.request(`/api/v1/revocaciones?desde=${desde}`, {
        headers: { Authorization: `Bearer ${await firmarAsercion(m)}` },
      });
      assert.equal(respuesta.status, 200);
      return (await respuesta.json()) as { revocaciones: { sujeto: string; solicitadaEn: string }[]; siguiente: string };
    };
    const primera = await pedir("0");
    assert.deepEqual(primera.revocaciones.map((r) => r.sujeto), ["a@example.com", "c@example.com"]);
    assert.equal(primera.revocaciones[0]!.solicitadaEn, "2026-11-03");
    assert.deepEqual((await pedir(primera.siguiente)).revocaciones, []);
  });

  it("rechaza aserciones inválidas en la API", async () => {
    const pedir = (token?: string) =>
      m.app.request(`/api/v1/estado?sujeto=${SUJETO}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    assert.equal((await pedir()).status, 401);
    assert.equal((await pedir("basura")).status, 401);
    assert.equal((await pedir(await firmarAsercion(m, { vidaS: 61 }))).status, 401);
    assert.equal((await pedir(await firmarAsercion(m, { aud: URL_SERVICIO }))).status, 401);
    // A request for the acceptance screen must not work as an API credential.
    assert.equal((await pedir(await firmarSolicitud(m))).status, 401);
  });

  it("impide modificar la evidencia incluso desde SQL", async () => {
    await aceptar(m);
    await enviar(m, await firmarSolicitud(m), { decision: "rechazar" });
    await registrarRevocacion(m.db, { entidad: "gct", correo: SUJETO, solicitadaEn: "2026-11-03", referencia: "r", operador: "o" });

    for (const tabla of ["aceptacion", "rechazo", "revocacion", "documento_version"]) {
      await assert.rejects(m.db.consulta(`DELETE FROM ${tabla}`), /solo de inserción/, tabla);
      await assert.rejects(m.db.script(`TRUNCATE ${tabla} CASCADE`), /solo de inserción/, tabla);
    }
    await assert.rejects(m.db.consulta("UPDATE aceptacion SET identidad = 'x'"), /solo de inserción/);
    assert.equal(await contar(m, "aceptacion"), 1);
  });

  it("rechaza un manifiesto que cambia la huella de una versión publicada", async () => {
    await aceptar(m);
    m.sitio.gct = manifiestoDe("gct", 2, "otro aviso");
    m.sitio.fuentes.set(m.sitio.gct.vigentes["aviso-privacidad"]!.fuente, "otro aviso");
    m.publicar(2);
    m.sitio.gct = manifiestoDe("gct", 2, "otro aviso");
    m.sitio.fuentes.set(m.sitio.gct.vigentes["aviso-privacidad"]!.fuente, "otro aviso");

    const respuesta = await enviar(m, await firmarSolicitud(m), { decision: "aceptar", casilla: "si" });
    assert.equal(respuesta.status, 503);
    assert.equal(await contar(m, "aceptacion"), 1);
  });

  it("responde salud y publica el JWKS", async () => {
    assert.equal(await (await m.app.request("/salud")).text(), "ok");
    const jwks = (await (await m.app.request("/.well-known/jwks.json")).json()) as { keys: JWK[] };
    assert.equal(jwks.keys[0]!.kid, "recibos-1");
  });
});
