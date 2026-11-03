/**
 * Exact source of a frozen version, /v/<tipo>/<version>/fuente.html
 * (contract §3.5). These bytes are the ones the published SHA-256 covers, so
 * anyone can download them and recompute the fingerprint.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { entidadDelBuild } from "../../../../entidades";
import { versionesDe, type VersionPublicada } from "../../../../lib/versiones";

export const getStaticPaths: GetStaticPaths = () =>
  versionesDe(entidadDelBuild().codigo).map((version) => ({
    params: { tipo: version.tipo, version: String(version.version) },
    props: { version },
  }));

export const GET: APIRoute = ({ props }) =>
  new Response((props as { version: VersionPublicada }).version.fuente, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
