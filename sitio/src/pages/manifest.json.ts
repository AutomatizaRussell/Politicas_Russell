/**
 * Machine-readable manifest of this entity's documents, /manifest.json
 * (contract §3.6). The consent service reads it to know which version is in
 * force and which fingerprint a receipt must carry.
 */
import type { APIRoute } from "astro";
import { entidadDelBuild } from "../entidades";
import { versionesDe, vigentesDe, type VersionPublicada } from "../lib/versiones";

/** Bump only on an incompatible change of this shape; consumers fail closed on unknown values. */
const FORMATO = 1;

export const GET: APIRoute = () => {
  const entidad = entidadDelBuild();
  const enlace = (v: VersionPublicada) => ({
    version: v.version,
    vigenteDesde: v.vigenteDesde,
    sha256: v.sha256,
    url: `${entidad.sitio}/v/${v.tipo}/${v.version}/`,
    fuente: `${entidad.sitio}/v/${v.tipo}/${v.version}/fuente.html`,
  });
  const vigentes = vigentesDe(entidad.codigo);

  const manifiesto = {
    formato: FORMATO,
    entidad: {
      codigo: entidad.codigo,
      razonSocial: entidad.razonSocial,
      nit: entidad.nit,
      correoNotificaciones: entidad.correoNotificaciones,
    },
    vigentes: {
      "politica-tratamiento": enlace(vigentes["politica-tratamiento"]),
      "aviso-privacidad": enlace(vigentes["aviso-privacidad"]),
    },
    historial: versionesDe(entidad.codigo).map(({ tipo, version, vigenteDesde, sha256, publicadaEn }) => ({
      tipo,
      version,
      vigenteDesde,
      sha256,
      publicadaEn,
    })),
  };
  return new Response(JSON.stringify(manifiesto, null, 2) + "\n", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
