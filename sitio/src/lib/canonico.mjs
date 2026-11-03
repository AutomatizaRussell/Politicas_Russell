/**
 * Canonical form of a legal source before hashing (contract §3.3).
 *
 * Plain JavaScript so the build (through Vite) and the registration script
 * (plain Node) share one implementation: two copies of this rule would be two
 * fingerprints for the same text.
 *
 * 1. Unicode NFC, so the same visible accent always has the same bytes.
 * 2. LF line endings: a Windows checkout writes CRLF, a Linux build reads LF.
 * 3. No trailing spaces or tabs on any line.
 * 4. Exactly one LF at the end of the text.
 *
 * @param {string} texto
 * @returns {string}
 */
export function canonicalizar(texto) {
  return (
    texto
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((linea) => linea.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/\n+$/, "") + "\n"
  );
}
