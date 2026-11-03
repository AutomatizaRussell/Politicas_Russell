-- Consent registry (docs/contrato-consentimiento.md §4.9).
--
-- Acceptances, rejections and revocations are legal evidence: they are insert
-- only, and the triggers at the end enforce that in the database so no
-- application bug or manual session can rewrite them by accident.

CREATE TABLE proyecto (
  id                TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  nombre            TEXT NOT NULL,
  entidad           TEXT NOT NULL CHECK (entidad IN ('gct', 'glt')),
  clase             TEXT NOT NULL CHECK (clase IN ('confidencial', 'publico')),
  documentos        TEXT[] NOT NULL CHECK (cardinality(documentos) > 0),
  regresos          TEXT[] NOT NULL CHECK (cardinality(regresos) > 0),
  identidad         TEXT CHECK (identidad IN ('declarada', 'codigo')),
  aviso_revocacion  TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Public keys only: the service never holds a project's private key.
CREATE TABLE proyecto_llave (
  proyecto_id  TEXT NOT NULL REFERENCES proyecto (id),
  kid          TEXT NOT NULL,
  jwk          JSONB NOT NULL,
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  retirada_en  TIMESTAMPTZ,
  PRIMARY KEY (proyecto_id, kid)
);

-- Copy of every version seen in a manifest. A published version never changes,
-- so a manifest that reports another fingerprint for it is rejected.
CREATE TABLE documento_version (
  entidad        TEXT NOT NULL CHECK (entidad IN ('gct', 'glt')),
  tipo           TEXT NOT NULL,
  version        INTEGER NOT NULL CHECK (version > 0),
  sha256         TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  vigente_desde  DATE NOT NULL,
  PRIMARY KEY (entidad, tipo, version)
);

-- A subject exists per entity: an authorization granted to one entity
-- authorizes nothing before the other (§2).
CREATE TABLE sujeto (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad  TEXT NOT NULL CHECK (entidad IN ('gct', 'glt')),
  correo   TEXT NOT NULL,
  UNIQUE (entidad, correo)
);

CREATE TABLE aceptacion (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sujeto_id      UUID NOT NULL REFERENCES sujeto (id),
  proyecto_id    TEXT NOT NULL REFERENCES proyecto (id),
  documentos     JSONB NOT NULL,
  identidad      TEXT NOT NULL,
  nombre         TEXT,
  navegador      TEXT NOT NULL,
  registrada_en  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX aceptacion_sujeto ON aceptacion (sujeto_id, registrada_en);

CREATE TABLE rechazo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sujeto_id      UUID NOT NULL REFERENCES sujeto (id),
  proyecto_id    TEXT NOT NULL REFERENCES proyecto (id),
  documentos     JSONB NOT NULL,
  identidad      TEXT NOT NULL,
  nombre         TEXT,
  navegador      TEXT NOT NULL,
  registrada_en  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX rechazo_sujeto ON rechazo (sujeto_id, registrada_en);

-- secuencia is the reconciliation cursor of GET /api/v1/revocaciones.
CREATE TABLE revocacion (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secuencia      BIGSERIAL UNIQUE NOT NULL,
  sujeto_id      UUID NOT NULL REFERENCES sujeto (id),
  solicitada_en  DATE NOT NULL,
  referencia     TEXT NOT NULL,
  operador       TEXT NOT NULL,
  registrada_en  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX revocacion_sujeto ON revocacion (sujeto_id, registrada_en);

-- Replay protection only: rows are useless once expired and may be purged.
CREATE TABLE solicitud_usada (
  proyecto_id  TEXT NOT NULL REFERENCES proyecto (id),
  jti          TEXT NOT NULL,
  expira_en    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (proyecto_id, jti)
);

CREATE FUNCTION rechazar_cambio() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% es solo de inserción', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER aceptacion_solo_insercion BEFORE UPDATE OR DELETE ON aceptacion
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();
CREATE TRIGGER aceptacion_sin_truncate BEFORE TRUNCATE ON aceptacion
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_cambio();
CREATE TRIGGER rechazo_solo_insercion BEFORE UPDATE OR DELETE ON rechazo
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();
CREATE TRIGGER rechazo_sin_truncate BEFORE TRUNCATE ON rechazo
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_cambio();
CREATE TRIGGER revocacion_solo_insercion BEFORE UPDATE OR DELETE ON revocacion
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();
CREATE TRIGGER revocacion_sin_truncate BEFORE TRUNCATE ON revocacion
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_cambio();
CREATE TRIGGER documento_version_solo_insercion BEFORE UPDATE OR DELETE ON documento_version
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();
CREATE TRIGGER documento_version_sin_truncate BEFORE TRUNCATE ON documento_version
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_cambio();
