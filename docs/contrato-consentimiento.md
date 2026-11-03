# Contrato de consentimiento — políticas de tratamiento de datos de GCT y GLT

```
ESTADO:    v1 PROPUESTA el 31-oct-2026. Decisiones del diseño aprobadas por el operador
           (§1); el texto de este contrato no está ratificado
CORTE:     sin construir: ni el sitio en Astro, ni el manifiesto, ni el servicio existen
EVIDENCIA: lectura de Gct/index.html y Glt/index.html (commit 471a653), comparados byte
           a byte con lo publicado en conecta-gctpoliticas.rbgct.cloud y
           conecta-gltpoliticas.rbgct.cloud el 30-oct-2026
```

**Autoridad:** este documento fija cómo se publican las políticas de tratamiento de datos y los avisos de privacidad de las dos entidades, y cómo cualquier proyecto pide, registra, verifica y deja de usar una autorización. Cada proyecto consumidor decide **cuándo** pide la autorización y qué hace sin ella; el **cómo** es este contrato.

## 1. Decisiones aprobadas

| Decisión | Fecha |
|---|---|
| Servicio central de consentimiento con pantalla de aceptación alojada (redirección) y registro único con revocación, más copia local en cada proyecto que la necesite | 30-oct-2026 |
| Multientidad: GCT y GLT desde la primera versión | 30-oct-2026 |
| Proyectos con backend (solicitud firmada) y sin backend (identificador público); la verificación de la identidad por código es una opción por proyecto | 30-oct-2026 |
| En la pantalla: aviso de privacidad, enlace a la política completa y casilla sin marcar. No se exige recorrer la política hasta el final | 30-oct-2026 |
| Quien no acepta no entra; el rechazo se registra para que el proyecto lo gestione por otro canal | 30-oct-2026 |
| Un solo repositorio, este, que sigue público: `sitio/` en Astro y `servicio/` en Hono, desplegados por separado (§6) | 3-nov-2026 |
| El servicio se aloja en el mismo servidor que los sitios de políticas | 31-oct-2026 |
| La versión y la vigencia son las del control de cambios de cada documento (§3.2), no la fecha en que entra al sitio | 31-oct-2026 |

## 2. Entidades

| Código | Razón social | NIT | Correo de notificaciones | Sitio |
|---|---|---|---|---|
| `gct` | Russell Bedford GCT S.A.S. | 811.044.406-8 | notificaciongct@rbcol.co | `conecta-gctpoliticas.rbgct.cloud` |
| `glt` | GLT Gestión Legal y Tributaria S.A.S. | 900.930.391-1 | notificaciones.glt@rbcol.co | `conecta-gltpoliticas.rbgct.cloud` |

Una autorización se otorga a **una** entidad. Aceptar la política de una no autoriza nada ante la otra.

## 3. Documentos y versiones

### 3.1 Tipos de documento

| Tipo | Contenido | Estado |
|---|---|---|
| `politica-tratamiento` | La política completa, secciones 1 a 17 con su control de cambios | Existe por entidad |
| `aviso-privacidad` | El aviso corto: responsable, finalidades, derechos y cómo consultar la política | Existe por entidad, al final de la misma página |
| `autorizacion-datos-sensibles` | Autorización específica para datos sensibles (salud, biométricos) | **No existe**: el texto lo redacta jurídica antes de que un proyecto lo exija |

### 3.2 Versión legal

La versión **no la inventa este sistema**: es la del control de cambios del propio documento (§17.4).

| Entidad | `politica-tratamiento` vigente | Aprobada |
|---|---|---|
| `gct` | V2 («Actualización de la política…»); V1 de 2022 | 15-sep-2025 |
| `glt` | V1 («Creación Política…») | 15-sep-2025 |

**Abierto (jurídica):** el aviso no tiene control de cambios propio. Mientras no se decida otra cosa, cada aviso lleva el mismo número de versión que la política de su entidad y se publica con ella.

Publicar una versión es un acto deliberado, nunca un efecto de un commit: se añade el archivo fuente nuevo y se registra en `versiones.json` (§3.4). Un cambio de estilo, de maquetación o de este repositorio no crea versión.

### 3.3 Huella del texto

`sha256` en hexadecimal sobre el **archivo fuente en Markdown** de esa versión, canonicalizado así:

1. Codificación UTF-8, normalización Unicode NFC.
2. Finales de línea LF.
3. Sin espacios al final de cada línea; exactamente un LF al final del archivo.

Se calcula sobre la fuente y no sobre el HTML porque el HTML cambia con el diseño. Cualquiera puede recalcularla: la fuente congelada se publica junto a cada versión (§3.5).

### 3.4 Fuente en el repositorio

```
sitio/contenido/<entidad>/<tipo>/<version>.md    # one immutable file per published version
sitio/contenido/<entidad>/versiones.json         # registry written when a version is published
```

`versiones.json` registra por cada versión: `tipo`, `version`, `vigenteDesde` (AAAA-MM-DD), `sha256` y `publicadaEn` (fecha en que entró a este sitio). **El build falla** si la huella calculada de un archivo no coincide con la registrada: así, editar una versión ya publicada no pasa en silencio.

### 3.5 Lo que publica cada sitio

| Ruta | Contenido | Cambia |
|---|---|---|
| `/` | Política y aviso vigentes, con el diseño actual | Con cada versión y con cada cambio de diseño |
| `/v/<tipo>/<version>/` | Esa versión en HTML | Solo de diseño; nunca de texto |
| `/v/<tipo>/<version>/fuente.md` | La fuente exacta sobre la que se calculó la huella | Nunca |
| `/manifest.json` | §3.6 | Con cada versión |

### 3.6 `manifest.json`

```json
{
  "formato": 1,
  "entidad": {
    "codigo": "gct",
    "razonSocial": "Russell Bedford GCT S.A.S.",
    "nit": "811.044.406-8",
    "correoNotificaciones": "notificaciongct@rbcol.co"
  },
  "vigentes": {
    "politica-tratamiento": {
      "version": 2,
      "vigenteDesde": "2025-09-15",
      "sha256": "<64 hex>",
      "url": "https://conecta-gctpoliticas.rbgct.cloud/v/politica-tratamiento/2/",
      "fuente": "https://conecta-gctpoliticas.rbgct.cloud/v/politica-tratamiento/2/fuente.md"
    },
    "aviso-privacidad": { "version": 2, "...": "same shape" }
  },
  "historial": [
    { "tipo": "politica-tratamiento", "version": 2, "vigenteDesde": "2025-09-15", "sha256": "<64 hex>" }
  ]
}
```

`formato` cambia solo si el contrato del manifiesto cambia de forma incompatible. Un consumidor que no conoce el `formato` recibido falla cerrado.

## 4. Servicio de consentimiento

### 4.1 Responsabilidades

- Mantener el registro de proyectos (§4.2).
- Mostrar la pantalla de aceptación, la misma para todos los proyectos, con el texto vigente de la entidad del proyecto.
- Registrar aceptaciones, rechazos y revocaciones en registros **solo de inserción**.
- Emitir recibos firmados (§4.5) y publicar sus llaves públicas.
- Responder el estado de un sujeto (§4.6) y avisar las revocaciones (§4.7).
- Ofrecer al operador un panel con inicio de sesión por Entra ID para registrar proyectos, aplicar revocaciones y consultar la prueba de un titular.

Lo que **no** hace: autenticar a las personas en nombre de los proyectos, ni decidir el acceso de nadie a un proyecto. Cada proyecto decide con su copia local o con el recibo.

### 4.2 Registro de proyectos

| Campo | Contenido |
|---|---|
| `id` | Identificador público estable, p. ej. `audithub-portal` |
| `entidad` | `gct` o `glt` |
| `clase` | `confidencial` (con backend) o `publico` (sin backend) |
| `documentos` | Tipos que el proyecto exige, p. ej. `["aviso-privacidad", "politica-tratamiento"]` |
| `regresos` | Direcciones de regreso permitidas, comparadas **exactamente** (sin comodines) |
| `llaves` | Solo `confidencial`: llaves públicas del proyecto (JWK, ES256) con `kid`. El servicio nunca guarda una llave privada de un proyecto |
| `identidad` | Solo `publico`: `declarada` o `codigo` (el servicio envía un código al correo) |
| `avisoRevocacion` | Opcional: URL a la que el servicio avisa las revocaciones (§4.7) |

### 4.3 Flujo de aceptación

**Proyecto confidencial**

1. El proyecto detecta que el sujeto no tiene una autorización vigente para todos sus `documentos`.
2. Firma una **solicitud** (JWS ES256 con su llave privada) y redirige a `GET /aceptar?solicitud=<jws>`.
3. El servicio valida la firma con la llave registrada, `aud`, `exp`, que `jti` no se haya usado y que `regreso` esté en `regresos`. Si algo falla, muestra un error y **no** redirige a ninguna parte.
4. Muestra el aviso vigente, el enlace a la política vigente y una casilla sin marcar, con «Aceptar» y «No acepto». El formulario lleva protección CSRF.
5. Registra el resultado y responde `303` a `regreso` con `?recibo=<jws>&state=<state>`.

**Proyecto público**

1. Redirige a `GET /aceptar?proyecto=<id>&regreso=<url>&state=<state>`.
2. El servicio valida que `regreso` esté en `regresos`. La persona escribe su correo en la pantalla y, si el proyecto exige `codigo`, lo confirma con un código enviado a ese correo.
3. Igual que los pasos 4 y 5 anteriores. El recibo declara `identidad: "declarada"` o `"verificada-por-codigo"`.

**Solicitud** (confidencial): `iss` = id del proyecto · `aud` = URL del servicio · `sub` = correo normalizado (minúsculas, sin espacios) · `nombre` opcional · `regreso` · `state` (opaco, lo devuelve el servicio tal cual) · `jti` · `iat` · `exp` ≤ 5 minutos después de `iat`.

### 4.4 Rechazo

«No acepto» registra un rechazo (sujeto, proyecto, versiones mostradas, fecha) y regresa con un recibo de `resultado: "rechazada"`. El rechazo no autoriza nada; existe para que el proyecto sepa que debe atender a esa persona por otro canal. Volver a intentarlo más tarde es posible.

### 4.5 Recibo

JWS ES256 firmado por el servicio, con `kid` publicado en `GET /.well-known/jwks.json`.

| Claim | Contenido |
|---|---|
| `iss` | URL del servicio |
| `aud` | id del proyecto |
| `sub` | correo normalizado |
| `jti` | id de la aceptación o del rechazo en el registro central |
| `resultado` | `aceptada` o `rechazada` |
| `entidad` | `{ codigo, nit }` |
| `documentos` | `[{ tipo, version, sha256 }]` exactamente como se mostraron |
| `identidad` | `verificada-por-proyecto` · `declarada` · `verificada-por-codigo` |
| `registradaEn` | Fecha y hora ISO 8601 con zona |
| `state` | El recibido en la solicitud |
| `iat`, `exp` | `exp` ≤ 10 minutos: limita el transporte, no la validez de la autorización |

El proyecto verifica firma, `aud`, `exp` y `state` **sin llamar al servicio**, y guarda el recibo completo en su copia local. Un recibo vencido en tránsito se rechaza y se vuelve a pedir; la autorización ya registrada en el servicio no se pierde.

Un proyecto sin backend no verifica nada para efectos legales: adjunta `jti` al envío de su formulario, y quien recibe esos datos (n8n, otro servicio) lo valida con `GET /api/v1/estado` antes de tratarlos.

### 4.6 Estado de un sujeto

`GET /api/v1/estado?sujeto=<correo>` — autenticado con una aserción firmada por el proyecto (JWS con su llave, `exp` ≤ 1 minuto). Responde por cada documento exigido por el proyecto:

| Estado | Significado |
|---|---|
| `vigente` | Aceptó la versión vigente y no revocó |
| `desactualizada` | Aceptó una versión anterior: hay que pedirla otra vez |
| `revocada` | Revocó después de aceptar |
| `rechazada` | Su último resultado fue «No acepto» |
| `ninguna` | Nunca se le pidió |

### 4.7 Revocación

1. El titular la pide por el canal de la entidad (correo de notificaciones). El operador la registra en el panel: sujeto, entidad, fecha de la solicitud y referencia al correo.
2. **Alcance:** toda la entidad. Una revocación parcial, por finalidad, queda para una versión posterior.
3. El servicio avisa a cada proyecto de esa entidad que tenga `avisoRevocacion`: `POST` con un cuerpo firmado por el servicio y reintentos con espera creciente.
4. Conciliación: cada proyecto con copia local consulta `GET /api/v1/revocaciones?desde=<cursor>` al menos **una vez al día**. Ese es el retraso máximo aceptado si un aviso se pierde.
5. Al recibirla, el proyecto marca su copia local y deja de admitir al sujeto hasta una aceptación nueva.

### 4.8 Cambio de versión

Cuando la entidad publica una versión nueva, el servicio la toma del manifiesto. Desde `vigenteDesde`, `estado` responde `desactualizada` para quien aceptó la anterior. Cada proyecto compara la versión de su copia local con el manifiesto, que puede guardar en caché hasta una hora, y vuelve a pedir la autorización en el siguiente ingreso.

### 4.9 Modelo (PostgreSQL)

| Tabla | Contenido |
|---|---|
| `proyecto`, `proyecto_llave` | §4.2 |
| `documento_version` | Copia del manifiesto: entidad, tipo, versión, huella, vigencia |
| `sujeto` | Entidad + correo normalizado |
| `aceptacion` | Solo inserción: sujeto, proyecto, versiones y huellas mostradas, identidad, fecha, evidencia (agente de usuario reducido a navegador y sistema; **sin IP**) |
| `rechazo` | Solo inserción, mismos campos |
| `revocacion` | Solo inserción: sujeto, entidad, fecha, referencia de la solicitud, operador |
| `solicitud_usada` | `jti` usados hasta su `exp` |
| `aviso_revocacion` | Entregas de §4.7 y sus reintentos |

### 4.10 Seguridad

- La pantalla de aceptación no carga scripts de terceros y lleva cabeceras de seguridad estrictas, incluida `frame-ancestors 'none'`: nunca se muestra dentro de otra página.
- Las direcciones de regreso se comparan exactamente. Un parámetro inválido nunca produce una redirección.
- La llave privada del servicio vive en el entorno de despliegue, nunca en el repositorio. Para rotarla se publica la nueva en el JWKS antes de usarla y se retira la anterior pasada la vida máxima de un recibo.
- Límites de frecuencia por proyecto y por sujeto en `/aceptar`, en el envío de códigos y en la API.
- El servicio es en sí una base de datos personales: respaldos, monitoreo y retención los fija §5.

## 5. Abierto

| # | Pendiente | Decide |
|---|---|---|
| A1 | Versión propia del aviso o la misma de la política (§3.2) | Jurídica |
| A2 | Texto de `autorizacion-datos-sensibles` | Jurídica |
| A3 | Supresión: un titular puede pedir que se borren sus datos, y la firma debe conservar la prueba de la autorización. Qué se conserva y cuánto tiempo | Jurídica |
| A4 | Si el servidor de los sitios tiene Coolify y PostgreSQL, quién lo opera y cómo se respalda | Operador |
| A5 | Activar el bloqueo de secretos al hacer push (§6), si el plan de la organización lo permite | Administrador del repositorio |
| A6 | Si `Unificado/` se publica en alguna parte y si se conserva | Operador |

## 6. Repositorio público

El repositorio es público: el texto de las políticas ya lo es por obligación, y la seguridad del servicio no puede depender de que nadie lea su código. Lo que la visibilidad expone son los descuidos, así que estas reglas no tienen excepciones:

1. **Nada secreto en el repositorio.** La llave privada del servicio, la conexión a PostgreSQL y las credenciales de Entra ID viven solo en las variables de entorno del despliegue. `.gitignore` excluye `.env*` salvo `.env.example`, que lleva nombres de variables y nunca valores.
2. **El registro de proyectos vive en la base de datos**, no en archivos del repositorio: ni llaves públicas de proyectos, ni direcciones de regreso, ni nombres de proyectos internos en el código.
3. **Ningún dato personal real** en pruebas, ejemplos ni migraciones. Los correos de ejemplo usan dominios reservados (`example.com`, `example.org`).
4. Si un secreto llega a subirse, **se rota de inmediato**. Borrarlo del historial no lo retira de las copias que ya existan.
