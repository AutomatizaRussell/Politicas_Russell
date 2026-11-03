// Fixed-window rate limits kept in process memory (contract §4.10). Good enough
// for one instance; running several would divide the effective limit's accuracy
// and this should then move to shared storage.

export interface Limite {
  maximo: number;
  ventanaMs: number;
}

export function crearLimitador(ahora: () => number = Date.now) {
  const ventanas = new Map<string, { cuenta: number; terminaEn: number }>();

  return {
    /** Counts one hit for `clave` and says whether it stays within the limit. */
    permitir(clave: string, limite: Limite): boolean {
      const momento = ahora();
      // Drop finished windows once the map grows, so it cannot grow without bound.
      if (ventanas.size > 10_000) {
        for (const [k, v] of ventanas) if (v.terminaEn <= momento) ventanas.delete(k);
      }
      const ventana = ventanas.get(clave);
      if (!ventana || ventana.terminaEn <= momento) {
        ventanas.set(clave, { cuenta: 1, terminaEn: momento + limite.ventanaMs });
        return true;
      }
      ventana.cuenta += 1;
      return ventana.cuenta <= limite.maximo;
    },
  };
}

export type Limitador = ReturnType<typeof crearLimitador>;
