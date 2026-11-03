// All SQL of the consent registry. Handlers and the operator CLI go through
// here, so the rules on subjects and insert-only evidence live in one place.

import type { JWK } from "jose";
import type { Db } from "./db.ts";
import type { CodigoEntidad, Manifiesto } from "./manifiesto.ts";
import type { DocumentoMostrado } from "./recibo.ts";

export interface Proyecto {
  id: string;
  nombre: string;
  entidad: CodigoEntidad;
  clase: "confidencial" | "publico";
  documentos: string[];
  regresos: string[];
  activo: boolean;
}

export async function obtenerProyecto(db: Db, id: string): Promise<Proyecto | null> {
  const filas = await db.consulta<Proyecto>(
    `SELECT id, nombre, entidad, clase, documentos, regresos, activo
       FROM proyecto WHERE id = $1`,
    [id],
  );
  return filas[0] ?? null;
}

/** Returns the key only while it is not retired. */
export async function obtenerLlaveActiva(db: Db, proyecto: string, kid: string): Promise<JWK | null> {
  const filas = await db.consulta<{ jwk: JWK }>(
    `SELECT jwk FROM proyecto_llave
      WHERE proyecto_id = $1 AND kid = $2 AND retirada_en IS NULL`,
    [proyecto, kid],
  );
  return filas[0]?.jwk ?? null;
}

export async function solicitudUsada(db: Db, proyecto: string, jti: string): Promise<boolean> {
  const filas = await db.consulta(
    "SELECT 1 FROM solicitud_usada WHERE proyecto_id = $1 AND jti = $2",
    [proyecto, jti],
  );
  return filas.length > 0;
}

/**
 * Copies the manifest's versions and rejects any published version whose
 * fingerprint changed: the evidence would otherwise point at an altered text.
 */
async function copiarVersiones(tx: Db, manifiesto: Manifiesto): Promise<void> {
  for (const v of manifiesto.historial) {
    await tx.consulta(
      `INSERT INTO documento_version (entidad, tipo, version, sha256, vigente_desde)
       VALUES ($1, $2, $3, $4, $5::date)
       ON CONFLICT (entidad, tipo, version) DO NOTHING`,
      [manifiesto.entidad.codigo, v.tipo, v.version, v.sha256, v.vigenteDesde],
    );
    const [guardada] = await tx.consulta<{ sha256: string }>(
      "SELECT sha256 FROM documento_version WHERE entidad = $1 AND tipo = $2 AND version = $3",
      [manifiesto.entidad.codigo, v.tipo, v.version],
    );
    if (guardada?.sha256 !== v.sha256) {
      throw new Error(`La versión ${v.version} de ${v.tipo} cambió de huella en el manifiesto`);
    }
  }
}

async function asegurarSujeto(tx: Db, entidad: CodigoEntidad, correo: string): Promise<string> {
  // The no-op update makes RETURNING yield the id when the subject already exists.
  const [fila] = await tx.consulta<{ id: string }>(
    `INSERT INTO sujeto (entidad, correo) VALUES ($1, $2)
     ON CONFLICT (entidad, correo) DO UPDATE SET correo = EXCLUDED.correo
     RETURNING id`,
    [entidad, correo],
  );
  return fila!.id;
}

export class SolicitudRepetida extends Error {}

export interface Resultado {
  proyecto: Proyecto;
  manifiesto: Manifiesto;
  sujeto: string;
  nombre: string | null;
  jtiSolicitud: string;
  expiraSolicitud: Date;
  resultado: "aceptada" | "rechazada";
  documentos: DocumentoMostrado[];
  identidad: string;
  navegador: string;
}

/**
 * Consumes the request and records the outcome in one transaction, so a request
 * can never be spent without leaving evidence, nor evidence be recorded twice.
 */
export async function registrarResultado(
  db: Db,
  r: Resultado,
): Promise<{ id: string; registradaEn: string }> {
  return db.transaccion(async (tx) => {
    const consumida = await tx.consulta(
      `INSERT INTO solicitud_usada (proyecto_id, jti, expira_en) VALUES ($1, $2, $3)
       ON CONFLICT (proyecto_id, jti) DO NOTHING RETURNING jti`,
      [r.proyecto.id, r.jtiSolicitud, r.expiraSolicitud],
    );
    if (consumida.length === 0) throw new SolicitudRepetida();

    await copiarVersiones(tx, r.manifiesto);
    const sujetoId = await asegurarSujeto(tx, r.proyecto.entidad, r.sujeto);

    // The table name comes from this closed choice, never from input.
    const tabla = r.resultado === "aceptada" ? "aceptacion" : "rechazo";
    const [fila] = await tx.consulta<{ id: string; registrada_en: Date }>(
      `INSERT INTO ${tabla} (sujeto_id, proyecto_id, documentos, identidad, nombre, navegador)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING id, registrada_en`,
      [sujetoId, r.proyecto.id, JSON.stringify(r.documentos), r.identidad, r.nombre, r.navegador],
    );
    return { id: fila!.id, registradaEn: fila!.registrada_en.toISOString() };
  });
}

export type EventoSujeto =
  | { clase: "aceptacion" | "rechazo"; id: string; en: Date; documentos: DocumentoMostrado[] }
  | { clase: "revocacion"; id: string; en: Date };

/** Every event of a subject before one entity, oldest first. */
export async function eventosDe(db: Db, entidad: CodigoEntidad, correo: string): Promise<EventoSujeto[]> {
  return db.consulta<EventoSujeto>(
    `SELECT 'aceptacion' AS clase, a.id, a.registrada_en AS en, a.documentos
       FROM aceptacion a JOIN sujeto s ON s.id = a.sujeto_id
      WHERE s.entidad = $1 AND s.correo = $2
     UNION ALL
     SELECT 'rechazo', r.id, r.registrada_en, r.documentos
       FROM rechazo r JOIN sujeto s ON s.id = r.sujeto_id
      WHERE s.entidad = $1 AND s.correo = $2
     UNION ALL
     SELECT 'revocacion', v.id, v.registrada_en, NULL
       FROM revocacion v JOIN sujeto s ON s.id = v.sujeto_id
      WHERE s.entidad = $1 AND s.correo = $2
     ORDER BY en`,
    [entidad, correo],
  );
}

export async function registrarRevocacion(
  db: Db,
  datos: { entidad: CodigoEntidad; correo: string; solicitadaEn: string; referencia: string; operador: string },
): Promise<string> {
  return db.transaccion(async (tx) => {
    const sujetoId = await asegurarSujeto(tx, datos.entidad, datos.correo);
    const [fila] = await tx.consulta<{ id: string }>(
      `INSERT INTO revocacion (sujeto_id, solicitada_en, referencia, operador)
       VALUES ($1, $2::date, $3, $4) RETURNING id`,
      [sujetoId, datos.solicitadaEn, datos.referencia, datos.operador],
    );
    return fila!.id;
  });
}

const TAMANO_PAGINA_REVOCACIONES = 500;

/** Reconciliation page: revocations of one entity after a cursor. */
export async function revocacionesDesde(db: Db, entidad: CodigoEntidad, cursor: string) {
  // Numeric text keeps a 64-bit cursor exact: it never passes through a JS number.
  const filas = await db.consulta<{ cursor: string; sujeto: string; solicitadaEn: string; registradaEn: Date }>(
    `SELECT v.secuencia::text AS cursor, s.correo AS sujeto,
            v.solicitada_en::text AS "solicitadaEn", v.registrada_en AS "registradaEn"
       FROM revocacion v JOIN sujeto s ON s.id = v.sujeto_id
      WHERE s.entidad = $1 AND v.secuencia > $2::text::bigint
      ORDER BY v.secuencia
      LIMIT ${TAMANO_PAGINA_REVOCACIONES}`,
    [entidad, cursor],
  );
  return {
    revocaciones: filas.map((f) => ({ ...f, registradaEn: f.registradaEn.toISOString() })),
    siguiente: filas.at(-1)?.cursor ?? cursor,
  };
}

/** Requests that expired can no longer be presented, so forgetting them is safe. */
export async function purgarSolicitudes(db: Db): Promise<void> {
  await db.consulta("DELETE FROM solicitud_usada WHERE expira_en < now() - interval '1 day'");
}

export interface DatosProyecto {
  id: string;
  nombre: string;
  entidad: CodigoEntidad;
  clase: "confidencial";
  documentos: string[];
  regresos: string[];
}

/** Creates or updates a project: unlike the evidence, its configuration changes. */
export async function guardarProyecto(db: Db, p: DatosProyecto): Promise<void> {
  await db.consulta(
    `INSERT INTO proyecto (id, nombre, entidad, clase, documentos, regresos)
     VALUES ($1, $2, $3, $4, $5::text[], $6::text[])
     ON CONFLICT (id) DO UPDATE SET
       nombre = EXCLUDED.nombre, documentos = EXCLUDED.documentos, regresos = EXCLUDED.regresos`,
    [p.id, p.nombre, p.entidad, p.clase, p.documentos, p.regresos],
  );
}

export async function agregarLlave(db: Db, proyecto: string, jwk: JWK): Promise<void> {
  await db.consulta(
    `INSERT INTO proyecto_llave (proyecto_id, kid, jwk) VALUES ($1, $2, $3::jsonb)`,
    [proyecto, jwk.kid, JSON.stringify(jwk)],
  );
}

export async function retirarLlave(db: Db, proyecto: string, kid: string): Promise<void> {
  await db.consulta(
    `UPDATE proyecto_llave SET retirada_en = clock_timestamp()
      WHERE proyecto_id = $1 AND kid = $2 AND retirada_en IS NULL`,
    [proyecto, kid],
  );
}
