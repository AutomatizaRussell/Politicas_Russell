/**
 * Catalog of the legal entities this site publishes policies for.
 *
 * Each build serves exactly one entity, chosen by the ENTIDAD environment
 * variable (a Docker build argument in production). Everything that differs
 * between the two sites lives here, so the layout and the pages never branch
 * on an entity code by hand.
 *
 * Contract: docs/contrato-consentimiento.md §2.
 */

export type CodigoEntidad = "gct" | "glt";

/** Document types a site can publish (contract §3.1). */
export type TipoDocumento = "politica-tratamiento" | "aviso-privacidad";

export interface Entidad {
  codigo: CodigoEntidad;
  razonSocial: string;
  nit: string;
  correoNotificaciones: string;
  /** Public origin of the site; absolute URLs in the manifest are built on it. */
  sitio: string;
  /** Page title shown in the browser tab. */
  tituloPagina: string;
  /** Label of each document's group in the table of contents. */
  etiquetaIndice: Record<TipoDocumento, string>;
  /** Alternative text of each document's banner image. */
  altBanner: Record<TipoDocumento, string>;
}

export const ENTIDADES: Record<CodigoEntidad, Entidad> = {
  gct: {
    codigo: "gct",
    razonSocial: "Russell Bedford GCT S.A.S.",
    nit: "811.044.406-8",
    correoNotificaciones: "notificaciongct@rbcol.co",
    sitio: "https://conecta-gctpoliticas.rbgct.cloud",
    tituloPagina: "Política de Tratamiento de Datos y Aviso de Privacidad — Russell Bedford GCT S.A.S.",
    etiquetaIndice: {
      "politica-tratamiento": "Política de tratamiento RUSSELL BEDFORD GCT S.A.S.",
      "aviso-privacidad": "Aviso de privacidad",
    },
    altBanner: {
      "politica-tratamiento": "Política de Tratamiento de Datos Personales — Russell Bedford GCT S.A.S.",
      "aviso-privacidad": "Aviso de Privacidad — Russell Bedford GCT S.A.S.",
    },
  },
  glt: {
    codigo: "glt",
    razonSocial: "GLT Gestión Legal y Tributaria S.A.S.",
    nit: "900.930.391-1",
    correoNotificaciones: "notificaciones.glt@rbcol.co",
    sitio: "https://conecta-gltpoliticas.rbgct.cloud",
    tituloPagina: "Política de Tratamiento de Datos y Aviso de Privacidad — GLT Gestión Legal y Tributaria S.A.S.",
    etiquetaIndice: {
      "politica-tratamiento": "Política de tratamiento GLT GESTION LEGAL Y TRIBUTARIA S.A.S.",
      "aviso-privacidad": "Aviso de privacidad",
    },
    altBanner: {
      "politica-tratamiento": "Política de Tratamiento de Datos Personales — GLT Gestión Legal y Tributaria S.A.S.",
      "aviso-privacidad": "Aviso de Privacidad — GLT Gestión Legal y Tributaria S.A.S.",
    },
  },
};

/**
 * Resolves the entity of the current build.
 *
 * Fails the build instead of defaulting: a site built for the wrong entity
 * would publish one company's policy under the other's domain.
 */
export function entidadDelBuild(): Entidad {
  const codigo = process.env.ENTIDAD;
  if (codigo !== "gct" && codigo !== "glt") {
    throw new Error(`ENTIDAD must be "gct" or "glt"; received ${JSON.stringify(codigo)}`);
  }
  return ENTIDADES[codigo];
}
