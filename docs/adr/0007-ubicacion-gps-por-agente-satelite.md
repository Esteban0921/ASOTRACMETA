# ADR-0007 — Ubicación GPS por agente satélite, sin secretos en la base

- Estado: aceptada (2026-09-22)
- Referencias: spec §2 (no-objetivos), §12 (seguridad y datos sensibles), §19 (fase 4), §20.9;
  ARCHITECTURE §6.13, §12; TASK-0062..0070; ADR-0005 (escrituras con rol de servicio),
  ADR-0006 (procesos de fondo sin BullMQ)

## Contexto

La asociación quiere ver dónde está cada tractocamión: en la ficha del vehículo, en la sala de
turnos y en un mapa, con el recorrido reciente. Los datos los tienen las plataformas de GPS que
cada propietario contrató; son dos o tres plataformas distintas, **sin API pública**, a las que se
entra con el usuario y la clave de ese propietario.

Eso choca con tres cosas escritas:

1. Spec §2, línea 66: «Telemetría GPS en vivo (solo se guarda qué proveedor usan; jamás la clave)»
   es un **no-objetivo del MVP**. Spec §19, línea 932, sí contempla «Integraciones posteriores
   (RNDC, GPS) como satélites» en la fase 4.
2. Spec §12, línea 777, y el criterio de aceptación §20.9 («Cero secretos de GPS en la base»):
   está **prohibido persistir contraseñas de terceros**. El Excel legado las guardaba en la misma
   hoja que el turno del día, y eso es justo lo que este sistema vino a eliminar.
3. La posición de un camión cada veinte minutos es un **dato personal del conductor** (Ley 1581 de
   2012, spec §12): permite reconstruir su jornada.

RULE-001 obliga a decidir esto explícitamente en una tarea en vez de arreglarlo por el camino.

## Decisión

- **Se amplía el alcance, acotado.** Entra «última ubicación conocida por placa, refrescada
  periódicamente, más un historial con retención corta». No entra telemetría en vivo (segundo a
  segundo), ni geocercas, ni reglas de negocio: el motor de cola no cambia. Es la «integración
  satélite» de la fase 4. Se anota en spec §2 y §19; §12 y §20.9 **no cambian**.
- **Un proceso satélite consulta; la API solo recibe.** Un agente aparte (`gps-agente`, mismo
  artefacto de despliegue, contenedor propio y perfil `gps`) es el único que conoce las
  credenciales, entra a cada plataforma, normaliza lo que lee y envía lotes a la API. Si una
  plataforma se cae, cambia de formato o bloquea una cuenta, la cola, `/readyz` y la operación no
  se enteran.
- **Las credenciales no tocan la base.** Viven en un archivo JSON en el host (`0400`, propiedad del
  usuario del contenedor, fuera de git y de los backups), montado de solo lectura únicamente en el
  contenedor del agente. No se crea ninguna columna para ellas (RULE-021), ni siquiera cifrada:
  cifrarlas seguiría siendo «secretos de GPS en la base» y §20.9 dice cero.
- **La ingesta se autentica con un token de servicio.** `POST /api/v1/gps/ubicaciones` es una ruta
  pública para el guard de sesión (como `/metrics`) y exige un Bearer comparado en tiempo
  constante contra `GPS_INGESTA_TOKEN` (y `GPS_INGESTA_TOKEN_ANTERIOR` mientras se rota). Es una
  **excepción explícita a RULE-022** («toda ruta lleva `exigir(recurso, permiso)`»): no hay sesión
  ni actor humano detrás. Queda acotada por el punto siguiente.
- **La ingesta escribe con un rol RLS propio, no con `sistema`.** El hook de autenticación fija
  `app.rol = 'sistema'` en toda ruta pública, y `sistema` es el rol más privilegiado del esquema
  (escribe cola, ofertas, TR, viajes, documentos y recaudos). Para que el token de ingesta no sea
  de facto una llave maestra, el handler escribe dentro de `conContexto({ rol: 'gps_ingesta' })` y
  la política de inserción de `vehiculo_ubicaciones` exige exactamente ese rol. Un fallo en la
  ruta de ingesta no tiene autoridad sobre nada más.
- **La ingesta no deja evento de auditoría por lote.** No es una mutación de dominio: no toca
  cola, oferta, TR ni viaje, y son setenta y dos lotes al día en un `audit_log` append-only que
  nunca se purga. La trazabilidad la dan `recibida_en`, `lote_id`, el log con conteos y las
  métricas. Sí se auditan la purga y la supresión, que son decisiones. ADR-0005 solo exige
  decidir y documentar con qué rol corre una escritura nueva fuera del motor: es `gps_ingesta`.
- **Minimización por contrato.** El esquema del lote es `strict`: placa, latitud, longitud,
  velocidad, rumbo, instante de captura y proveedor. Nombre del conductor, teléfono o identificador
  del equipo no caben, así que no entran ni por descuido. Nada del «crudo» del proveedor se guarda.
- **Reparto de visibilidad.** Roles internos ven la posición exacta; el `member` solo sus placas
  (RBAC `own` + RLS); el `viewer` es `R*` en `vehiculos` y recibe solo la frescura («reportando» o
  «sin señal» y hace cuánto), nunca coordenadas: su función es vigilar la equidad de la cola.
  Criterio nuevo §20.11: «un viewer no obtiene coordenadas; un member no obtiene ubicación ajena».
- **Retención corta y purga automática.** `gps_retencion_dias` (30 por defecto) y una purga diaria
  que conserva siempre la última captura de cada placa, para poder decir «sin señal desde el 3 de
  marzo» en vez de «sin datos».
- **La autorización viene de los términos de asociado.** Quien usa este sistema no es público
  general: son asociados de ASOTRACMET que ya aceptaron los términos y condiciones del gremio, y
  el tratamiento de la ubicación del vehículo queda amparado ahí (decisión del 2026-09-22). No se
  recoge una autorización firmada por vehículo. La condición para que eso sea válido bajo la Ley
  1581 de 2012 es que esos términos digan expresamente qué se recoge (ubicación del vehículo),
  para qué (operación del enturnamiento y trazabilidad del viaje), cuánto se conserva
  (`gps_retencion_dias`) y cómo se pide su supresión (TASK-0069): sin eso la autorización no es
  informada. El archivo de cuentas conserva un campo `autorizacion` opcional para anotar la
  versión de los términos que ampara cada cuenta.
- **La plataforma es Vía GPS sobre `gpsmobile.net`.** Vía GPS (viagps.co) no opera plataforma
  propia: su portal de acceso es `https://gpsmobile.net/Default.aspx?userlogo=177`, una aplicación
  ASP.NET WebForms (IIS 10, .NET 4.0) con sesión por cookie y sin captcha ni segundo factor. No
  publica API ni documentación de integración. El adaptador se construye imitando su acceso, y en
  paralelo conviene pedir a Vía GPS una API o un usuario de solo lectura: sería más estable y
  evitaría depender de una página que puede cambiar sin aviso.

## Alternativas descartadas

- **Guardar las claves cifradas en Postgres** (como `usuarios.totp_secret_enc` o
  `asociados.cuenta_bancaria_enc`), gestionadas desde la pantalla de administración. Más cómodo de
  operar, pero contradice RULE-021, spec §12 y el criterio §20.9 tal como están escritos; habría
  exigido cambiar los tres. El cifrado protege datos de negocio, no contraseñas ajenas.
- **Una sola cuenta corporativa en la plataforma.** Sería lo ideal (una credencial, en variables de
  entorno), pero los propietarios contratan el GPS por su cuenta y no existe tal cuenta hoy.
  Si alguna plataforma ofrece una cuenta de flota o una API con token, se migra a ella y el
  adaptador correspondiente deja de necesitar el archivo.
- **Un job dentro del proceso de la API.** Menos piezas, pero metería el archivo de credenciales en
  el mismo contenedor que la operación y, si alguna plataforma obliga a automatizar un navegador,
  también Chromium. Un scraping colgado compartiría proceso con la cola.
- **Un espacio de trabajo y una imagen propios para el agente desde el día uno.** Aísla más, pero
  la imagen actual ya empaqueta scripts y el contenedor ya es independiente. Se hará solo si un
  adaptador real exige un navegador.
- **Empujar las posiciones por el canal de tiempo real.** Duplicaría la decisión de TASK-0060
  (eventos por SSE). La web consulta cada minuto; el dato cambia cada veinte.
- **Auditar cada lote.** Ruido permanente en la pantalla de auditoría sin responder ninguna
  pregunta que no respondan ya `recibida_en` y las métricas.

## Consecuencias

- `ContextoRls.rol` admite `gps_ingesta` además de los roles y `sistema`; cualquier tabla futura
  que quiera aceptar escrituras de la ingesta debe nombrarlo en su política.
- `GPS_INGESTA_TOKEN` es un secreto de primer nivel: abre la única ruta pública que escribe. Se
  rota con la variable `_ANTERIOR` sin cortar el servicio y se trata como `AUTH_SECRET`.
- Quien tenga el token puede averiguar si una placa existe y si está activa (la respuesta lo dice
  para que el operador corrija el archivo de cuentas). Se acepta: es el operador del agente.
- El despliegue gana un contenedor opcional (perfil `gps`) y un archivo de secretos que hay que
  crear y respaldar fuera del repositorio. Con ese perfil activo, `METRICS_TOKEN` pasa a ser
  obligatorio: las métricas describen el estado de la flota.
- La web gana una dependencia de cartografía cuando llegue el mapa (TASK-0066), con teselas de un
  tercero que recibe las coordenadas consultadas.

## Preguntas abiertas

- ¿El veedor debería ver la posición aproximada en vez de nada? Hoy no ve coordenadas; cambiarlo es
  un `if` y una fila de la spec §3.2.
- ¿Treinta días de retención son suficientes para resolver una disputa de viaje? Es un parámetro.
- Si alguna plataforma ofrece API oficial con token, ese adaptador dejará de usar el archivo de
  cuentas: conviene pedirla antes de escribir el adaptador imitado.
