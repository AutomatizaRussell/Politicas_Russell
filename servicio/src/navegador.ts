// Contract §4.9: the evidence keeps the user agent reduced to browser and
// operating system. The full string could help fingerprint a person, and
// proving an authorization does not need it.

// Order matters: Edge and Opera also declare Chrome, and Chrome also declares Safari.
const NAVEGADORES: readonly [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\bOPR\//, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

// iOS and Android come first because their strings also mention Mac and Linux.
const SISTEMAS: readonly [RegExp, string][] = [
  [/\biPhone\b|\biPad\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

function primeraCoincidencia(texto: string, reglas: readonly [RegExp, string][]): string {
  return reglas.find(([patron]) => patron.test(texto))?.[1] ?? "Otro";
}

export function reducirAgente(agente: string | undefined): string {
  const texto = agente ?? "";
  return `${primeraCoincidencia(texto, NAVEGADORES)} / ${primeraCoincidencia(texto, SISTEMAS)}`;
}
