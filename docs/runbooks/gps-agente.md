# El agente GPS no reporta (ADR-0007, TASK-0064)

El agente es el proceso satélite que cada `gps_intervalo_minutos` entra a la plataforma de GPS de
cada propietario, lee dónde está el camión y se lo entrega a la API. Corre **aparte**, en el
servicio `gps-agente` del compose (perfil `gps`), y es el único que ve el archivo con las
credenciales. Si deja de funcionar, la cola, las ofertas y los TR siguen exactamente igual: lo
único que pasa es que la web empieza a mostrar «sin señal».

## Cómo se detecta

| Señal                                         | Qué significa                                              |
| --------------------------------------------- | ---------------------------------------------------------- |
| `asotracmet_gps_ultimo_lote_segundos` sube y no baja | No llega ningún lote: el agente está caído, sin red o con el token rechazado |
| `asotracmet_gps_placas_sin_senal` sube          | Llegan lotes pero faltan placas: cuentas apartadas o placas que el proveedor no reporta |
| La ficha de una placa dice «Sin GPS»            | Esa placa nunca ha reportado (no está en ninguna cuenta, o su plataforma no la devuelve) |

`/metrics` es la fuente; con el perfil `gps` activo **`METRICS_TOKEN` es obligatorio**, porque esos
contadores describen el estado de la flota.

## Qué mirar, en este orden

```bash
# 1. ¿El contenedor está vivo?
docker compose -f infra/compose.prod.yaml --env-file .env.prod --profile gps ps gps-agente

# 2. ¿Qué dice? (JSON, una línea por ciclo; nunca trae usuario, clave ni coordenadas)
docker compose -f infra/compose.prod.yaml --env-file .env.prod --profile gps logs --tail=50 gps-agente
```

Lo que se puede leer en esas líneas:

- `"gps agente: ciclo terminado"` con `cuentas`, `consultadas`, `saltadas`, `fallidas`, `enviadas`,
  `guardadas`. Es la foto de la vuelta.
- `"gps agente: la API rechazó el token"` → el token de ingesta no coincide. **Importante:** cuando
  esto pasa, el agente **no consulta ninguna plataforma** en esa vuelta, a propósito, para no gastar
  intentos de acceso de los propietarios. Se arregla en `.env.prod` (ver rotación más abajo).
- `"gps agente: cuenta apartada"` con `motivo` y `saltarHasta` → esa cuenta falló y se deja
  descansar unos ciclos, duplicando la espera. Si el motivo es `credenciales_invalidas`, la clave de
  ese propietario cambió: hay que actualizarla en el archivo de cuentas. Insistir cada veinte
  minutos con una clave vieja es la forma más rápida de que la plataforma bloquee **su** cuenta.
- `"gps agente: no hay adaptador para esa plataforma"` → el campo `proveedor` de esa cuenta no
  corresponde a ningún adaptador instalado (hoy: `simulado`, y `viagps` cuando cierre TASK-0067).
- `"gps agente: no se pudieron leer las cuentas"` → el archivo no está montado, no es JSON válido o
  no cumple el formato. El agente **no** reutiliza las credenciales de la vuelta anterior.

## Todas las capturas llegan «fuera de rango»

Si `ignoradas` es alto y `guardadas` cero, casi siempre es la zona horaria: la plataforma reporta en
hora local y el adaptador la está mandando como si fuera UTC (o al revés). La API descarta lo que
venga con más de cinco minutos en el futuro o más viejo que `gps_retencion_dias`. Se confirma
mirando `capturadaEn` de un lote en la base:

```sql
select placa, capturada_en, recibida_en
  from vehiculo_ubicaciones u join vehiculos v on v.id = u.vehiculo_id
 order by recibida_en desc limit 5;
```

## Rotar el token de ingesta sin cortar el servicio

1. Genera uno nuevo: `openssl rand -base64 32`.
2. En `.env.prod`: `GPS_INGESTA_TOKEN_ANTERIOR` = el que estaba, `GPS_INGESTA_TOKEN` = el nuevo.
3. Levanta la API (`up -d app`) y después el agente con el nuevo token (`up -d gps-agente`).
4. Cuando el agente entregue bien, borra `GPS_INGESTA_TOKEN_ANTERIOR` y vuelve a levantar la API.

## Alta, baja o cambio de clave de una cuenta

El archivo vive **en el host**, nunca en el repositorio ni en la base (ADR-0007, RULE-021):

```bash
sudo -e /etc/asotracmet/gps-cuentas.json      # el formato está en infra/gps-cuentas.example.json
sudo chown 1000:1000 /etc/asotracmet/gps-cuentas.json
sudo chmod 0400 /etc/asotracmet/gps-cuentas.json
```

No hace falta reiniciar: el agente lo relee en cada vuelta. Si los permisos dejan leerlo a otros
usuarios, el agente lo avisa en el log.

## Si sospechas que el archivo se filtró

1. Cambia la clave de cada cuenta afectada **en la plataforma del propietario**, con él.
2. Actualiza el archivo y revisa quién tiene acceso al host.
3. El daño posible es acotado: ese archivo no da acceso a ASOTRACMET, solo a las plataformas de GPS.
   El token de ingesta es otra cosa y se rota aparte.

## Escribir el adaptador de una plataforma nueva (TASK-0067 y siguientes)

1. Entra al portal con una cuenta de prueba **autorizada**, con las herramientas de desarrollo del
   navegador abiertas en la pestaña de red.
2. Anota la petición de acceso (campos del formulario, cookies) y, ya dentro, **cuál es la petición
   que devuelve las posiciones**: URL, método, cabeceras, forma de la respuesta y en qué zona
   horaria viene la hora.
3. Guarda una respuesta real, quítale todo lo que no sea placa, coordenadas, velocidad, rumbo e
   instante, y déjala como fixture del test.
4. Escribe el adaptador en `apps/api/src/gps/agente/proveedores/`, con un solo acceso por vuelta y
   errores tipados (`credenciales_invalidas`, `formato_inesperado`, `red`, `limitado`).

Para Vía GPS (`https://gpsmobile.net/Default.aspx?userlogo=177`) el acceso ya está reconocido: es
ASP.NET WebForms, el formulario manda `txtUsername`, `txtPassword`, `btnSubmit` y los campos de
estado `__VIEWSTATE`, `__VIEWSTATEGENERATOR` y `__EVENTVALIDATION`, que hay que leer primero con un
GET y devolver en el POST junto con la cookie de sesión. No tiene captcha ni segundo factor. Lo que
falta es el punto 2: qué petición trae las posiciones.

## Probarlo sin credenciales ni red

```bash
pnpm dev                                    # API en memoria, con el token de desarrollo
GPS_CUENTAS_ARCHIVO=infra/gps-cuentas.example.json GPS_PROVEEDOR_FORZADO=simulado pnpm gps:agente
curl -s localhost:3001/metrics | grep gps   # deben subir lotes y ubicaciones
```
