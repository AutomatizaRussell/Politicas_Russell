#!/usr/bin/env node
/**
 * Registers a new version of a legal document (contract §3.2, §3.4).
 *
 * Usage:
 *   pnpm registrar-version <entidad> <tipo> <version> <vigenteDesde>
 *   pnpm registrar-version gct politica-tratamiento 3 2027-02-01
 *
 * Preconditions, all checked before anything is written:
 * - contenido/<entidad>/<tipo>/<version>.html exists (the Pandoc HTML of the
 *   approved Word document);
 * - that version is not registered yet: published versions are immutable;
 * - it is higher than every registered version of that type.
 *
 * The source file is rewritten in canonical form and its fingerprint is
 * appended to contenido/<entidad>/versiones.json. Publishing a version is a
 * deliberate act: run this only for a text approved by the legal team.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizar } from "../src/lib/canonico.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const [entidad, tipo, versionTexto, vigenteDesde] = process.argv.slice(2);

const fallar = (mensaje) => {
  console.error(`registrar-version: ${mensaje}`);
  process.exit(1);
};

if (!["gct", "glt"].includes(entidad)) fallar(`unknown entity ${JSON.stringify(entidad)}`);
if (!["politica-tratamiento", "aviso-privacidad"].includes(tipo)) fallar(`unknown document type ${JSON.stringify(tipo)}`);
const version = Number(versionTexto);
if (!Number.isInteger(version) || version < 1) fallar(`version must be a positive integer, got ${JSON.stringify(versionTexto)}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde ?? "")) fallar("vigenteDesde must be AAAA-MM-DD");

const fuente = join(raiz, "contenido", entidad, tipo, `${version}.html`);
if (!existsSync(fuente)) fallar(`missing source ${fuente}`);

const rutaRegistro = join(raiz, "contenido", entidad, "versiones.json");
const registro = existsSync(rutaRegistro) ? JSON.parse(readFileSync(rutaRegistro, "utf8")) : { versiones: [] };
const delTipo = registro.versiones.filter((v) => v.tipo === tipo);
if (delTipo.some((v) => v.version === version)) fallar(`${entidad} ${tipo} v${version} is already registered and cannot change`);
if (delTipo.some((v) => v.version > version)) fallar(`${entidad} ${tipo} already has a version higher than ${version}`);

const canonica = canonicalizar(readFileSync(fuente, "utf8"));
writeFileSync(fuente, canonica, "utf8");

// The registration date is the calendar day in Bogotá, where the legal
// entities operate, not the machine's UTC day.
const publicadaEn = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

registro.versiones.push({
  tipo,
  version,
  vigenteDesde,
  sha256: createHash("sha256").update(canonica, "utf8").digest("hex"),
  publicadaEn,
});
registro.versiones.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.version - b.version);
writeFileSync(rutaRegistro, JSON.stringify(registro, null, 2) + "\n", "utf8");
console.log(`Registered ${entidad} ${tipo} v${version} (in force from ${vigenteDesde}).`);
