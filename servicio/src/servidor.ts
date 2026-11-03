// Entry point: migrates, then listens. A failed migration stops the process
// before it can serve anything against an outdated schema.

import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { crearApp } from "./app.ts";
import { cadenaConexion, leerConfiguracion, URLS_MANIFIESTO } from "./configuracion.ts";
import { crearDbPg, migrar } from "./db.ts";
import { crearManifiestos } from "./manifiesto.ts";
import { crearFirmante } from "./recibo.ts";
import { purgarSolicitudes } from "./registro.ts";

const configuracion = leerConfiguracion();
const db = crearDbPg(cadenaConexion());

const aplicadas = await migrar(db, fileURLToPath(new URL("../migraciones", import.meta.url)));
console.log(JSON.stringify({ evento: "migraciones", aplicadas }));

const app = crearApp({
  db,
  manifiestos: crearManifiestos({ urls: URLS_MANIFIESTO }),
  firmante: await crearFirmante({
    llavePrivada: configuracion.llavePrivada,
    llavesRetiradas: configuracion.llavesRetiradas,
    urlServicio: configuracion.urlServicio,
  }),
  urlServicio: configuracion.urlServicio,
});

const UNA_HORA_MS = 60 * 60 * 1000;
setInterval(() => {
  purgarSolicitudes(db).catch((error: Error) => {
    console.log(JSON.stringify({ evento: "error", mensaje: error.message }));
  });
}, UNA_HORA_MS).unref();

serve({ fetch: app.fetch, port: configuracion.puerto }, ({ port }) => {
  console.log(JSON.stringify({ evento: "escuchando", puerto: port }));
});
