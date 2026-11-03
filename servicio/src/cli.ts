// Operator commands, run in the container's terminal in Coolify. They stand in for
// the Entra ID panel of contract §4.1, which is not built yet.

import { cadenaConexion } from "./configuracion.ts";
import { crearDbPg, type Db } from "./db.ts";
import { ENTIDADES, type CodigoEntidad } from "./manifiesto.ts";
import { generarLlave } from "./recibo.ts";
import { agregarLlave, eventosDe, guardarProyecto, registrarRevocacion, retirarLlave, type DatosProyecto } from "./registro.ts";
import { esCorreoNormalizado } from "./solicitud.ts";
import type { JWK } from "jose";

const AYUDA = `Comandos:
  generar-llave <kid>
  proyecto-guardar '<json: id, nombre, entidad, documentos, regresos>'
  llave-agregar <proyecto> '<jwk pública con kid>'
  llave-retirar <proyecto> <kid>
  revocacion-registrar <entidad> <correo> <AAAA-MM-DD> <referencia> <operador>
  prueba <entidad> <correo>`;

function entidadValida(valor: string | undefined): CodigoEntidad {
  if (!ENTIDADES.includes(valor as CodigoEntidad)) throw new Error("La entidad debe ser gct o glt");
  return valor as CodigoEntidad;
}

function correoValido(valor: string | undefined): string {
  const correo = valor?.trim().toLowerCase();
  if (!esCorreoNormalizado(correo)) throw new Error("Correo inválido");
  return correo;
}

/** Only https return addresses: a receipt carries personal data in its URL. */
function proyectoValido(p: DatosProyecto): DatosProyecto {
  if (!p.id || !p.nombre || !p.documentos?.length || !p.regresos?.length) {
    throw new Error("El proyecto debe traer id, nombre, entidad, documentos y regresos");
  }
  entidadValida(p.entidad);
  for (const regreso of p.regresos) {
    if (new URL(regreso).protocol !== "https:") throw new Error(`Regreso sin https: ${regreso}`);
  }
  return { ...p, clase: "confidencial" };
}

function llavePublica(jwk: JWK): JWK {
  if (jwk.d) throw new Error("Esa es una llave privada: el servicio solo guarda llaves públicas");
  if (!jwk.kid) throw new Error("La llave debe traer kid");
  return jwk;
}

async function ejecutar(db: Db, comando: string, a: (string | undefined)[]): Promise<void> {
  switch (comando) {
    case "proyecto-guardar":
      await guardarProyecto(db, proyectoValido(JSON.parse(a[0] ?? "{}") as DatosProyecto));
      return;
    case "llave-agregar":
      await agregarLlave(db, a[0]!, llavePublica(JSON.parse(a[1] ?? "{}") as JWK));
      return;
    case "llave-retirar":
      await retirarLlave(db, a[0]!, a[1]!);
      return;
    case "revocacion-registrar": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a[2] ?? "") || !a[3] || !a[4]) throw new Error(AYUDA);
      const id = await registrarRevocacion(db, {
        entidad: entidadValida(a[0]),
        correo: correoValido(a[1]),
        solicitadaEn: a[2]!,
        referencia: a[3],
        operador: a[4],
      });
      console.log(id);
      return;
    }
    case "prueba":
      console.log(JSON.stringify(await eventosDe(db, entidadValida(a[0]), correoValido(a[1])), null, 2));
      return;
    default:
      throw new Error(AYUDA);
  }
}

const [comando, ...argumentos] = process.argv.slice(2);

try {
  if (comando === "generar-llave") {
    // Needs no database. The output is a secret: it goes to the deployment
    // environment and nowhere else.
    if (!argumentos[0]) throw new Error(AYUDA);
    console.log(JSON.stringify(await generarLlave(argumentos[0])));
  } else {
    if (!comando) throw new Error(AYUDA);
    const db = crearDbPg(cadenaConexion());
    try {
      await ejecutar(db, comando, argumentos);
    } finally {
      await db.cerrar();
    }
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
