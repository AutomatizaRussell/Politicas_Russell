// Minimal database surface used by the service. Production implements it with
// pg; the tests implement it with PGlite, a real PostgreSQL compiled to WASM,
// so triggers, constraints and SQL are exercised without a running server.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

export interface Db {
  /** Runs one parameterized statement and returns its rows. */
  consulta<T>(sql: string, parametros?: unknown[]): Promise<T[]>;
  /** Runs a script of several statements without parameters. */
  script(sql: string): Promise<void>;
  /** Runs `fn` in a transaction; a thrown error rolls everything back. */
  transaccion<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** Creates the production implementation over a connection pool. */
export function crearDbPg(cadenaConexion: string): Db & { cerrar(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: cadenaConexion, max: 10 });

  return {
    async consulta<T>(sql: string, parametros: unknown[] = []) {
      const resultado = await pool.query(sql, parametros);
      return resultado.rows as T[];
    },
    async script(sql) {
      await pool.query(sql);
    },
    async transaccion<T>(fn: (tx: Db) => Promise<T>) {
      const cliente = await pool.connect();
      // Statements inside the transaction must share this one connection.
      const tx: Db = {
        async consulta<R>(sql: string, parametros: unknown[] = []) {
          const resultado = await cliente.query(sql, parametros);
          return resultado.rows as R[];
        },
        async script(sql) {
          await cliente.query(sql);
        },
        transaccion() {
          throw new Error("Las transacciones no se anidan");
        },
      };
      try {
        await cliente.query("BEGIN");
        const valor = await fn(tx);
        await cliente.query("COMMIT");
        return valor;
      } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
      } finally {
        cliente.release();
      }
    },
    cerrar: () => pool.end(),
  };
}

// Arbitrary constant identifying this service's migration lock in PostgreSQL.
const LLAVE_BLOQUEO_MIGRACION = 7_204_118;

/**
 * Applies pending files of `directorio` in name order, each in its own
 * transaction. The advisory lock keeps two starting instances from racing.
 */
export async function migrar(db: Db, directorio: string): Promise<string[]> {
  const archivos = (await readdir(directorio)).filter((a) => a.endsWith(".sql")).sort();

  return db.transaccion(async (tx) => {
    await tx.consulta("SELECT pg_advisory_xact_lock($1::bigint)", [LLAVE_BLOQUEO_MIGRACION]);
    await tx.script(`CREATE TABLE IF NOT EXISTS migracion (
      archivo TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    )`);
    const hechas = await tx.consulta<{ archivo: string }>("SELECT archivo FROM migracion");
    const yaAplicadas = new Set(hechas.map((fila) => fila.archivo));

    const aplicadas: string[] = [];
    for (const archivo of archivos) {
      if (yaAplicadas.has(archivo)) continue;
      await tx.script(await readFile(join(directorio, archivo), "utf8"));
      await tx.consulta("INSERT INTO migracion (archivo) VALUES ($1)", [archivo]);
      aplicadas.push(archivo);
    }
    return aplicadas;
  });
}
