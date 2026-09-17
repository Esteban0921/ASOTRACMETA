# BRIEF FINAL · ASOTRACMET Enturnamiento — "Llano Abierto" + Acta de turno

**Base:** propuesta ganadora 1 (sala como centro de control + Acta de turno). **Injertos:** identidad y navegación única de la 3 (Llano Abierto, useMediaQuery, React.lazy, una sola fuente), tokens con ratio verificado, reloj de servidor y alertas proactivas por outbox de la 4, Acta del mes imprimible y "cabeza no va en verde" de la 2, HojaInferior de declinación y ChipElegibilidad con enlace a documentos de la 0.

**Estado del backlog verificado:** las 43 TASK de `ISSUES.md` están `hecha`, incluida TASK-0017 (CI en verde, commit 63d401c). No hay pendientes: las tareas nuevas empiezan en TASK-0044.

**Contrato intocable (verificado en `e2e/enturnamiento.spec.ts`):** todos los `data-testid` listados en §4, los textos `Tu posición: N de M en TM-CBZ`, `No habilitada`, `Documento vencido`, `Reset de cola`, `Vencido`, `Vence en`, `Liquidado`, `Pendiente`, `Pagado`, `Nuevo turno para FST189`, `Avisos` / `Avisos (1)` como texto exacto de `nav-avisos`; `cola-TM-CBZ tbody tr` con primer `td` = posición (l. 263, 330); `tablero-placa-*` con `td` nth(1)=Ofrecidas, nth(2)=Tomadas, nth(5)=Tomó (l. 414-416); `declinar-oferta` deshabilitado sin motivo; `logout` visible nada más entrar en 1280×720 para todos los roles; `page.once('dialog')` en l. 255 y 381 (se cambian solo en la tarea que las sustituye). El frontend nunca decide quién sigue (RULE-010): toda cabeza, candidato o salto viene de la API.

---

## 1. Identidad visual: "Llano Abierto"

Verde profundo del morichal como familia tonal (continuidad con el `#0f3d3e` actual), ocre de amanecer en la sabana como acento (y es el ámbar obligatorio de §9.3), papel cálido en vez de gris de dashboard, placas y códigos como objetos tipográficos. El color solo significa estado: ámbar = oferta abierta, verde = TR asignado / elegible, rojo = cancelado, declinado, intervención, gris = no habilitado. La cabeza elegible se marca con **marca**, no con verde (verde queda reservado a TR asignado, §9.3). Logotipo propio: monograma "A" de dos líneas de carretera al horizonte con sol ocre (`componentes/Marca.tsx`, SVG inline; favicon e iconos PWA 192/512 maskable regenerados del mismo símbolo). Lema en login: "La cola es de todos".

### Tokens (`apps/web/src/estilos/tokens.css`; `color-scheme: light dark` en `:root`; oscuro bajo `@media (prefers-color-scheme: dark) { :root:not([data-tema="claro"]) }` y `:root[data-tema="oscuro"]`, conmutador en menú de usuario guardado en `localStorage`; `theme-color` doble con `media` en `index.html`)

| Token | Claro | Oscuro |
|---|---|---|
| `--fondo` (papel) | `#F5F4EF` | `#0E1514` |
| `--superficie` | `#FFFFFF` | `#162020` |
| `--superficie-2` | `#EEF1EE` | `#1C2827` |
| `--borde` / `--borde-fuerte` | `#DCDFDA` / `#B9C0BC` | `#263331` / `#3B4C48` |
| `--texto` / `--texto-2` / `--texto-3` (solo ≥18 px) | `#1A2321` / `#4F605E` (6,6:1) / `#6F807D` | `#E8EDEB` / `#9FB0AD` (7,4:1) / `#8A9997` |
| Marca 900/800/700/600/500/300/100/50 | `#0A2B2C` `#0F3D3E` `#16514E` `#215B53` `#2E7469` `#79B1A9` `#D2E6E2` `#EAF3F1` | igual (la sidebar es marca-900 en ambos modos) |
| `--accion` (botón primario) / `--accion-hover` / `--enlace` | marca-700 / marca-800 / marca-600 | `#2E7469` con texto `#F5F4EF` / `#215B53` / `#7FC3B8` |
| Ámbar texto / fondo / borde / sólido | `#7A4B00` / `#FFF4DC` / `#F0B64A` / `#D98324` (6,8:1) | `#FFD48A` / `#3A2A0A` / `#B7791F` / `#D98324` |
| Verde | `#14532D` / `#E3F5EA` / `#4CB27A` / `#1F7A4D` (8,0:1) | `#9EE6BC` / `#0F2E1D` / `#2F9E63` / `#2F9E63` |
| Rojo | `#8A1C12` / `#FDE8E6` / `#E5675B` / `#B42318` (7,9:1) | `#FFB4AC` / `#3B1512` / `#C43D30` / `#C43D30` |
| Gris | `#475552` / `#EEF1F0` / `#B8C2BF` / `#6B7280` (6,8:1) | `#AEBCB9` / `#1F2A28` / `#4A5956` / `#6B7280` |
| Info (en curso, avisos neutros) | `#1E3A8A` / `#E8F0FE` / `#5B8DEF` | `#BFD3FF` / `#10203A` / `#3B6FD1` |
| `--foco` | `#2F6FED` (sobre marca-900: `#F2B266`) | `#F2B266` |

Los ratios se comprueban con un test unitario de contraste (WCAG 2.x) sobre cada par texto/fondo de tokens; falla bajo 4,5:1.

- **Tipografía:** una sola familia, **Inter Variable** subset latín (≈95 KB woff2) en `apps/web/public/fonts/inter-latin-var.woff2`, `font-display: swap`, respaldo `local('Segoe UI'), local('Roboto')` con `size-adjust`, preload en `index.html`, precacheada por Workbox. Nunca Google Fonts. Escala (px/lh): `--t-xs` 12/16 (badges, meta; siempre ≥600), `--t-sm` 13/18 (tablas densas), `--t-md` 14/20 (cuerpo densidad operación), `--t-base` 16/24 (cuerpo móvil e inputs: nunca menos de 16 en inputs), `--t-lg` 18/26, `--t-xl` 22/28 (sección), `--t-2xl` 28/34 (título de página), `--t-3xl` 36/40 (posición en tabla de cabeza), `--t-display` clamp(56px, 40px + 5vw, 80px)/1 (número de posición en Mi turno, wght 800). Pesos 400/500/600/700. Se elimina el `uppercase` global de `h2`. Clase `.codigo`: `font-variant-numeric: tabular-nums slashed-zero; letter-spacing: .04em; text-transform: uppercase; font-weight: 600` para placas, TR, cédulas enmascaradas y contadores (sin fuente monoespaciada).
- **Espaciado (4 px):** `--e-1` 4 · `--e-2` 8 · `--e-3` 12 · `--e-4` 16 · `--e-5` 20 · `--e-6` 24 · `--e-8` 32 · `--e-10` 40 · `--e-12` 48. Gutter móvil 16 px, sin scroll horizontal de página. Anchos: `--ancho-lectura` 720 (Mi turno, Avisos), `--ancho-admin` 960, `--ancho-max` 1440, sala sin máximo.
- **Radios:** `--r-s` 6 (chips, inputs) · `--r-m` 10 (botones, campos) · `--r-l` 14 (tarjetas, diálogos) · `--r-xl` 20 (hoja inferior) · `--r-pill` 999.
- **Sombras (solo claro; en oscuro se sustituyen por `--borde-fuerte` + `inset 0 1px 0 rgb(255 255 255 / .04)`):** `--sombra-1` 0 1px 2px rgb(16 32 31 / .06) · `--sombra-2` 0 4px 12px rgb(16 32 31 / .08) · `--sombra-3` 0 12px 32px rgb(16 32 31 / .16).
- **Foco:** `:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px }` global; `--foco` pasa a `#F2B266` dentro de `.sidebar` y `.cabecera-marca`.
- **Movimiento:** `--dur-1` 120 ms, `--dur-2` 200 ms, `--dur-3` 320 ms (resaltado de fila que cambió, con `@starting-style`), `--curva` cubic-bezier(.2,.8,.2,1); `@media (prefers-reduced-motion: reduce)` todo a 0.
- **Táctil:** 44 px mínimo, 52-56 px para Aceptar/Declinar. Capas: `--z-sticky` 10, `--z-nav` 20, `--z-dialogo` 40, `--z-toast` 50.
- **Densidades:** `[data-densidad="operacion"]` (14 px, filas 40 px) en /ops, /hseq, /finance, /admin*, /tablero; `[data-densidad="bolsillo"]` (16 px, objetivos 48 px) en /me y /notificaciones.
- **Arquitectura CSS:** `estilos.css` importa `estilos/tokens.css`, `base.css` (reset, foco, `color-scheme`, `tabular-nums`, reduced-motion), `componentes.css`, `pantallas/*.css`. CSS nesting, container queries (`container-type: inline-size` en `.sala`, `.columna`, `.tabla-envoltura`), `color-mix`, `light-dark()` donde no haga falta el override manual. Cero librerías CSS.

---

## 2. Shell

`componentes/AppShell.tsx` sustituye a `Layout.tsx`. **Se monta UNA sola navegación** según `useMediaQuery('(min-width: 768px)')` (nunca sidebar y barra inferior ocultas por CSS a la vez: duplicaría `nav-*` y rompe el modo estricto de Playwright). Los enlaces conservan `data-testid` y textos actuales; el SVG del icono va `aria-hidden` y no aporta `textContent`.

- **Escritorio ≥1024 px (roles internos):** `BarraLateral` de 240 px sobre marca-900: Marca arriba; grupos con encabezado 11 px mayúsculas: **Operación** (Sala de turnos, Tablero `nav-tablero`), **Flota** (HSEQ `nav-hseq`), **Recaudo** (Finanzas `nav-finance`), **Gobierno** (Administración `nav-admin`, Usuarios `nav-usuarios`, Parámetros `nav-parametros`, Auditoría `nav-auditoria`; siempre desplegado para superadmin); Avisos `nav-avisos` con píldora ámbar de conteo (el texto del Link sigue siendo `Avisos` + ` (n)`); activo = barra ocre 3 px + fondo rgb(255 255 255 / .10). Abajo: `IndicadorActualizacion` y bloque de usuario (`usuario-actual`: Avatar de iniciales, nombre, `textoRol(rol)`, botón Salir `logout`). Colapsable a raíl de 64 px con tooltips (estado en localStorage).
- **Tablet 768-1023:** raíl de 64 px por defecto.
- **Móvil <768 px y siempre para `member`:** cabecera de 52 px (Marca, título, campana `nav-avisos`, botón Salir `logout` con icono y texto, para que siga visible) + `BarraInferior` fija de 56 px + `env(safe-area-inset-bottom)`, 3-4 pestañas de 48 px con `aria-current`: member → Mi turno · Avisos · Mis datos (ancla a `habeas-data`); internos → Sala · HSEQ/Finanzas/Tablero según rol · Avisos · Más (HojaInferior con el resto, mismos `nav-*`).
- **Cabecera de página** (`PaginaCabecera`, 56 px, sticky): h1 real (fija `document.title`, p. ej. "Sala de turnos · ASOTRACMET"), contexto (Pestanas de clase y `cola-cliente` en la sala, mes en Finanzas/Tablero), acciones primarias, `IndicadorActualizacion`: punto + "Actualizado hace 3 s" (verde: última query OK; ámbar: último refresco falló; rojo + banda `sin-conexion` con su texto actual cuando no hay red; `role=status`, `data-testid="estado-actualizacion"`). Enlace "Saltar al contenido" como primer foco. `EstadoConexion` se convierte en `BandaConexion` (mismo `data-testid`).
- **Rutas:** `React.lazy` + `Suspense` con `EsqueletoPagina` por ruta: el bundle del member no incluye Ops/Hseq/Finance/Admin. Rutas y `RutaProtegida` de `App.tsx` no cambian; se añaden `/me/historial` y `/libro/:clase/acta` (§5).
- **Refresco:** hook `useRefresco(baseMs)` que devuelve `refetchInterval` = base si la pestaña está visible, `false` si `document.hidden`, y `refetchOnWindowFocus` + refetch en `visibilitychange`. Sala 4 s con ofertas abiertas / 8 s en reposo; Mi turno 15 s; Finanzas 30 s; contador de avisos 15 s.
- **Reloj:** `useReloj()` (un solo `setInterval` de 1 s) con desfase calculado desde la cabecera `date` de las respuestas de `api()` (mismo origen) suavizado; si el desfase supera 5 min, aviso "La hora de tu celular está desajustada". Alimenta toda `CuentaRegresiva`.

---

## 3. Componentes reutilizables (`apps/web/src/componentes/ui/*`, cada uno con test de Testing Library; todos aceptan `data-testid` y lo pasan al elemento interactivo interno)

| Componente | Props clave | Dónde |
|---|---|---|
| `Icono` | `nombre` (mapa cerrado de ~28 paths SVG propios 24×24, stroke 1.75, `currentColor`), `tamano`, `titulo?` (si no, `aria-hidden`) | Todo |
| `Marca` | `variante: 'completa' \| 'simbolo'` | Sidebar, cabecera móvil, Login, Entrar |
| `Boton` | `variante: primario \| secundario \| sutil \| peligro \| enlace`, `tamano: sm(32) \| md(40) \| lg(52)`, `cargando` (spinner + `aria-busy`), `icono?` | Todo; sustituye el estilo global de `button` (estilos.css:54-84) |
| `Chip` | `tono: ambar \| verde \| rojo \| gris \| marca \| info`, `icono?`, siempre texto traducido (`textoEstado*`, `tonoEstado/tonoViaje/tonoSemaforo` de `utils/formato.ts`); punto de color a la izquierda | Estados de oferta/TR/viaje/recaudo/documento; corrige enum crudo en Ops.tsx:237 y Me.tsx:155 y el badge sin tono de Notificaciones.tsx:90 |
| `ChipElegibilidad` | `elegibilidad`, `enlaceDocumentos?` | Chip gris con `textoElegibilidad` + botón "i" que abre `Tooltip` con `detalle` (sustituye `title=` de Ops.tsx:181); en Mi turno enlaza a `mis-documentos` |
| `Placa` | `placa`, `clase?`, `etiqueta?` (nombre completo, §9.3), `cabeza?` | Cola, actividad, HSEQ, Finanzas, Mi turno |
| `CodigoTr` | `codigo`, `copiable` (toast "TR-41947 copiado", icono → check 1,5 s) | Actividad, Mi turno, Finanzas |
| `Tarjeta` | `titulo?`, `acciones?`, `tono?` (borde izquierdo 4 px + fondo semántico) | Sustituye `.card` |
| `Campo` | `etiqueta`, `ayuda?`, `error?` (`aria-describedby`, `aria-invalid`), envuelve input/select/textarea/date/month/file (zona de arrastre para soportes HSEQ) | Todos los formularios |
| `Pestanas` | `items[{id, etiqueta, contador?, testid}]`, `role=tablist/tab/tabpanel`, flechas/Home/End | `cola-tab-*`, `admin-clase-*`, columnas de la sala en móvil |
| `TablaDensa` | `columnas`, `filas`, cabecera sticky, `maxAltura` (scroll interno), `filaSeleccionada` (`aria-selected`, arregla Finance.tsx:185), `filaCambiada`, esqueleto de N filas, `EstadoVacio` integrado; bajo 560 px de contenedor cada fila es tarjeta con `data-label` | Cola, HSEQ, Finanzas, Tablero, Auditoría, Usuarios |
| `Tooltip` | `contenido`, abre por hover/foco/tap, Esc cierra, `aria-describedby` | Elegibilidad, tarifa sugerida, raíl colapsado |
| `Dialogo` | `<dialog>` nativo, foco atrapado, Esc, `titulo`, `acciones`; presets `DialogoMotivo` (textarea ≥3 caracteres con contador, `data-testid="dialogo-motivo"`) y `DialogoConfirmar` (resumen del cambio, `data-testid="dialogo-confirmar"` / `dialogo-cancelar`) | Anular (Ops.tsx:222), habilitación (Hseq.tsx:495), rol (Usuarios.tsx:217), reset (Admin.tsx:104), parámetros (Parametros.tsx:188), cancelar TR / no tramitar |
| `HojaInferior` | `Dialogo` anclado abajo en móvil, centrado en escritorio | Declinar oferta, Más de la barra inferior, ficha desde la cola en táctil, `ActaTurno` |
| `Drawer` | panel lateral derecho 420 px (escritorio) / `HojaInferior` (móvil) | Ficha de placa desde la cola, `ActaTurno` |
| `Avisador` + `useAvisar()` | región `aria-live=polite`, cola máx. 3, tonos, autocierre 5 s (error 8 s, no se autocierra si `role=alert`), acción opcional | Todo; los mensajes con testid (`hseq-mensaje`, `finance-mensaje`, `usuarios-mensaje`, `admin-mensaje`, `param-mensaje`, `pref-mensaje`, `error-ops`, `error-me`) se mantienen además como línea inline `role=status/alert` |
| `Esqueleto` | `variante: tabla \| tarjeta \| kpi \| hero`, respeta reduced-motion | Toda consulta `isPending` |
| `EstadoVacio` | `icono`, `titulo`, `texto`, `accion?` | Cola vacía, sin requerimientos, `sin-oferta`, sin avisos |
| `EstadoError` | `error`, `reintentar` (`query.refetch`) | Toda consulta `isError` |
| `CuentaRegresiva` | `expiraEn`, `tamano: 20 \| 28 \| 64`, anillo SVG + mm:ss, verde >15 min, ámbar ≤15, rojo ≤5, `role=timer`, anuncios `aria-live` en 15/5/1, "Expirada" | Ofertas abiertas en sala y `OfertaCard` |
| `BarraCupos` | `asignados`, `abiertas`, `libres` (verde/ámbar/gris) + leyenda textual | `TarjetaRequerimiento` |
| `TarjetaRequerimiento` | requerimiento, `PanelSiguiente`, botón `ofrecer-<id>` | Sala |
| `PanelSiguiente` | `requerimientoId` → "Saldrá FST189 · ASOCIADO 02 · se salta SPS413: no habilitada para HLB" (§5) | Sala |
| `ActaTurno` | `ofertaId` (Drawer) | Sala, Mi turno, Avisos, Tablero |
| `MedidorPosicion` | `posicion`, `total`, pista de N puntos (propio en marca, no elegibles en gris, `aria-hidden`) | Mi turno |
| `TileMetrica` | `valor` (`--t-2xl` tabular), `etiqueta`, `delta?` | Tablero (`tablero-ofrecidas`, `tablero-aceptadas`), Finanzas (`finance-resumen-*`) |
| `BarraEquidad` | `tomadas`, `ofrecidas` → barra + porcentaje | Tablero |
| `Semaforo` | lista de documentos con tono y días (`hseq-alerta-*`, `mi-documento-*`) | HSEQ, Mi turno |
| `LineaTiempo` | `hitos[{at, tono, icono, texto, accion?}]` | Actividad de la sala, Historial de mi placa, Intervenciones |
| `Avatar` | iniciales sobre marca-100 | Usuario, actor de intervención, cliente en requerimiento |
| `SelectorTema` | sol/luna/sistema, `data-tema` + localStorage | Menú de usuario |

---

## 4. Rediseño por pantalla

**Login (`/login`)** — Pantalla dividida en escritorio (panel marca-900 con Marca, ilustración SVG de horizonte llanero y lema; formulario en Tarjeta a la derecha), una columna en móvil. Dos pasos con indicador de progreso (correo → contraseña/código). Modo oscuro. Conserva `login-email`, `login-password`, `login-submit`, `login-codigo`, `login-verificar`, `login-volver`, `login-info`, `login-error`, `login-totp-secret`.

**Entrar (`/entrar`, magic link)** — Misma composición; `entrar-cargando` como Esqueleto con texto; `entrar-error` como Tarjeta roja con acción "Pedir otro enlace".

**Sala de turnos (`/ops`, pantalla principal §9.2)** — Rejilla `320px minmax(0,1fr) 340px` en ≥1400 px; 1000-1400: actividad en panel plegable a la derecha con contador de ofertas abiertas; <1000: pestañas Requerimientos | Cola | Actividad pegajosas. Cada panel con scroll interno (`calc(100dvh - 56px)`): la sala nunca desplaza la página.
- *Requerimientos:* botón "Nuevo requerimiento" (Dialogo sobre `POST /requerimientos`, hoy sin UI) + `TarjetaRequerimiento` (Avatar del cliente, destino 15/600, "TM-CBZ · x2 · servicio hoy", `BarraCupos`, observaciones plegadas, `PanelSiguiente`, botón primario "Ofrecer cupo" `ofrecer-<id>` en **un solo clic**, deshabilitado con motivo visible "Sin cupos libres"). `requerimiento-<id>` en el article.
- *Cola:* `Pestanas` `cola-tab-<clase>` con contador de elegibles; `cola-cliente` con etiqueta visible "Habilitación para"; búsqueda por placa/asociado y conmutador "solo elegibles" (filtran en cliente sin tocar el orden). `TablaDensa` `cola-<clase>`: columnas # (`.codigo` 16/700; **sigue siendo el primer `td` con solo el número**), Placa · asociado (`Placa` + nombre completo en segunda línea; en la cabeza Chip **marca** "Siguiente"), Ronda, Turnos ("3/5" + minibarra), Estado (`ChipElegibilidad` con el texto que busca el e2e), acción "Ver ficha" (Drawer con `GET /vehiculos/:id/ficha`). Fila cabeza: borde izquierdo 4 px marca-500 y fondo marca-50, `data-cabeza="true"` en `cola-fila-<PLACA>`; no elegibles en `--texto-2` (nunca opacidad que baje de AA); filas que cambiaron de posición parpadean ámbar-fondo 320 ms. Debajo, tira "Intervenciones en <clase>" (`intervenciones` / `intervencion`, Chip rojo, Avatar del actor, motivo entre comillas) siempre visible (§21).
- *Actividad (`actividad`):* `LineaTiempo` con filtros Todo · Ofertas · TR · Intervenciones. Oferta abierta (`li[data-testid=oferta-abierta]`): Tarjeta ámbar con `CuentaRegresiva` 28 px, `Placa`, cliente·destino, botón sutil "Anular" `anular-<id>` → `DialogoMotivo`, enlace "Ver acta". TR reciente (`tr-item`): Chip traducido, `CodigoTr` copiable, placa, cliente, fecha relativa; menú "Cancelar TR" / "No tramitar" (rutas existentes, `DialogoMotivo`, solo si `puede(rol,'trs','A')`), "Ver acta". `GET /trs` se llama con `desde=<hoy-2d>&limite=30` en vez de la historia entera.
- Toasts para éxito; `error-ops` se mantiene como banda `role=alert` inline. Sin `window.prompt`.

**Mi turno (`/me`, member, densidad bolsillo, 360 px primero)** — Orden: (1) `OfertaCard` si existe, (2) posición por placa, (3) Turnos que pasaron, (4) Mis documentos, (5) Mis TR, (6) Tus datos.
- *OfertaCard* (`oferta-card`): Tarjeta ámbar a sangre, borde 2 px; Chip "Oferta abierta" + `CuentaRegresiva` 64 px "Responde en 1:47:12 · vence a las 12:04"; lista Cliente / Destino / Clase / Servicio; línea "Te tocó porque: primera placa elegible para HLB" (del acta); `Boton` lg primario ancho completo "Aceptar" (`aceptar-oferta`, `cargando`); separador "¿No puedes tomarlo?" con el bloque de declinación **siempre visible** (el e2e selecciona `motivo-declinacion` sin abrir nada): `Campo` select `motivo-declinacion` (16 px, 48 px alto) con los ids de catálogo, `nota-declinacion`, `Boton` peligro `declinar-oferta` ancho completo deshabilitado sin motivo. Sin red (`navigator.onLine` false): ambos botones deshabilitados con explicación. Al llegar una oferta (por refetch): `navigator.vibrate?.([120,60,120])`, `document.title` "(1) Oferta abierta · Mi turno", toast. `sin-oferta`: `EstadoVacio` con el texto actual.
- *Posición:* una Tarjeta por placa; número `--t-display`, "de 10 en TM-CBZ", `Placa`, `MedidorPosicion`, `ChipElegibilidad` propia (verde "Elegible" o gris "No elegible: SOAT vencido" con enlace a Mis documentos), "Eres el siguiente" en marca cuando es cabeza; el `<p data-testid="mi-posicion">` conserva literalmente `Tu posición: 2 de 10 en TM-CBZ · FST189` como pie visible.
- *Turnos que pasaron* (`mis-saltos`, §5) y enlace "Ver todo mi historial" → `/me/historial` (`LineaTiempo` por placa desde `/me/saltos`, `/me/ofertas`, `/me/trs` e intervenciones que afectaron a sus placas: "16 sep 10:04 · Te saltaron: no habilitada para HLB", "Ayer · Aceptaste TR-41947 y pasaste al final"; sin tabla nueva).
- Mis documentos (`mis-documentos`, `mi-documento-<TIPO>`) como `Semaforo`; Mis TR (`mis-trs`) con `CodigoTr` copiable y Chip; Tus datos (`habeas-data`, `descargar-extracto`) como Tarjeta discreta. `error-me` intacto. Polling 15 s con pausa por visibilidad.

**HSEQ (`/hseq`)** — Maestro-detalle: lista de placas como `TablaDensa` con `Semaforo` en fila (`hseq-semaforo-*`, `hseq-alerta-*`), alta en Tarjeta (`hseq-nueva-*`), ficha en columna con cabecera (`Placa` grande, asociado, Chip; `ficha-titulo`, `ficha-cola`, `ficha-semaforo`) y `Pestanas` Documentos (`doc-*`, `ficha-doc-estado-*`, `doc-archivo-*` con zona de arrastre, `doc-descargar-*`) / Habilitaciones (`hab-*`, interruptores con `DialogoMotivo`) / Conductores. La renovación por `input type=date` (Hseq.tsx:423-430) pide `DialogoConfirmar` antes del PATCH. `hseq-mensaje` inline + toast.

**Finanzas (`/finance`)** — TR sin viaje como tarjetas con `finance-crear-<TR>`; tabla de viajes con fila seleccionada visible (`finance-viaje-<TR>`, arregla `.activo`) y `button` dentro de la celda en vez de `tr onClick`; ficha en Drawer (`finance-ficha-titulo`, `finance-flete`, `finance-guardar`, `finance-liquidar`, `finance-recaudo`, `finance-estado-recaudo`, `finance-pago-*`, tarifa sugerida como Chip con Tooltip); resumen del mes como `TileMetrica` (`finance-resumen-recaudo`, `finance-resumen-pendiente`); `finance-exportar` y `finance-mensaje` intactos. Polling 30 s.

**Tablero (`/tablero`)** — `TileMetrica` para ofrecidas/aceptadas/declinadas/TR/viajes (`tablero-ofrecidas`, `tablero-aceptadas` como el elemento que contiene solo el número); tabla por clase y tabla de equidad `TablaDensa` con `BarraEquidad` dentro de la celda "Tomó" (el texto sigue siendo "100 %"), `tablero-placa-<PLACA>` con las 9 celdas actuales en el mismo orden y la nueva **"Saltadas" como 10.ª celda al final**; bloque "Saltos por motivo" con barras horizontales (sin librería); selector de mes en `PaginaCabecera`; Esqueleto al cargar (hoy Tablero.tsx:46 no pinta nada). Botón "Acta del mes" (§5).

**Administración (`/admin`)** — Override como "Mover <placa> antes de <placa>" con vista previa del orden leída de la API y confirmación; reset como pasos numerados (motivo `reset-motivo`, texto `reset-confirmacion`, código `reset-codigo`, enviar `reset-enviar`) con `DialogoConfirmar`; `admin-clase-*` en `Pestanas`; `admin-mensaje`, `admin-intervenciones`, `override-*` intactos. Se elimina la lista numérica "Nueva posición" que parece editar posición (§9.3).

**Usuarios (`/admin/usuarios`)** — Formulario en Tarjeta con `Campo` (`usuario-nuevo-email/nombre/rol/placas/enviar`; el selector de placas sigue siendo un `<select multiple>` accesible estilizado con chips de lo elegido, porque el e2e hace `selectOption('veh-QOR007')`), tabla `usuario-fila-<email>`, cambio de rol con `DialogoMotivo`, `usuarios-mensaje`.

**Parámetros (`/admin/parametros`)** — Tarjetas por grupo (Cola, Ofertas, Recaudo, Avisos), etiquetas legibles para políticas (`al_final` → "Pasa al final"), resumen del diff antes de guardar en `DialogoConfirmar`; `param-<clave>`, `param-guardar`, `param-mensaje`, `param-historial` con el texto `120 → 90` intactos; nuevo `param-aviso_proximo_turno_posiciones`.

**Auditoría (`/admin/auditoria`)** — Filtros como `Campo` (`audit-entidad`), tabla con actor y acción traducidos (`textoAccionAudit`), resumen antes → después como chips y JSON en `<pre>` con scroll; `audit-fila-<accion>` con el texto `120 → 90`.

**Avisos (`/notificaciones`)** — Lista agrupada por día con Chip por evento e icono (`aviso-<evento>`, `aviso-leer`, `data-leida`), "Leída" en gris, "Marcar todas"; fecha con `formatearFechaHora` (America/Bogota; elimina el duplicado de Notificaciones.tsx:10-18); preferencias en Tarjeta (`pref-whatsapp`, `pref-celular`, `pref-guardar`, `pref-mensaje`); nuevos avisos `cola.proximo`, `documento.bloquea_turno`, `cola.sin_elegibles` con enlace a la pantalla que toca.

---

## 5. Innovación: **Acta de turno** — quién sigue, por qué y a quién se saltó, antes y después de ofrecer

**Qué hace.** Hoy `siguienteElegible` (motor-cola.ts:647-697) calcula `descartes[placa] = motivo` y los tira salvo en `COLA_VACIA`; `oferta.crear` audita la oferta a secas (l. 797). La innovación los convierte en un acta en tres momentos:
1. **Antes:** `PanelSiguiente` en cada requerimiento muestra "Saldrá FST189 · ASOCIADO 02 · se salta SPS413: no habilitada para HLB", con una `firma` de la cola.
2. **Al ofrecer:** el clic en `ofrecer-<id>` envía `{ esperado: { vehiculoId, firma } }`; si la cola cambió (otro coordinador, expiración, HSEQ), la API responde `409 CANDIDATO_CAMBIO` **sin efectos** y la sala dice "La cola cambió: ahora sigue TKM221. Revisa y vuelve a ofrecer". El coordinador afirma lo que vio; el motor decide (RULE-010).
3. **Después:** los descartes se persisten en `oferta_saltos` en la misma transacción; `ActaTurno` reconstruye la decisión para coordinador, veedor y asociado; Mi turno muestra "Turnos que pasaron: 17 sep 10:04 · HLB Castilla · te saltaron por SOAT vencido"; el tablero gana "Saltadas" por motivo; el veedor imprime el **Acta del mes** para la asamblea; HSEQ y el asociado reciben alertas antes de perder el turno.

**Dominio (`packages/domain`).**
- `elegibilidad.ts`: función pura `evaluarCola(posiciones, ctx) → { candidato, descartes: Descarte[], penalizadas }` con `Descarte = { posicion, vehiculoId, placa, motivo: MotivoNoElegible, detalle }` (los 7 motivos de elegibilidad.ts:34-87). Sin efectos.
- `motor-cola.ts`: `siguienteElegible` usa `evaluarCola` y devuelve `{ candidato, descartes }`; `ofrecerEnTx(tx, req, actor, esperado?)` compara `esperado` **antes** de `consumirSaltos` (así el 409 no consume penalizaciones ni audita); `firmaCola(clase, clienteId, posiciones, ofertasAbiertasIds)` = FNV-1a 64 puro (sin puerto de crypto) sobre `vehiculoId:ciclo:saltosPendientes:turnosOfrecidos` + ids de ofertas abiertas; mismatch → `ErrorDominio('CANDIDATO_CAMBIO', …, { esperado, actual: { vehiculoId, placa } })`. `crearOferta` recibe `descartes` y llama `tx.guardarSaltos(ofertaId, descartes)`; `oferta.crear.after` pasa a incluir `claseCola`, `clienteId`, `posicionElegida`, `descartes`, `firma` y `parametrosAplicados` (`declinacion_politica`, `bloquear_por_documento_vencido`, `un_tr_activo_por_placa`, `oferta_ttl_minutos`). Nuevo `previsualizarOferta(requerimientoId, actor)` de solo lectura (`uow.leer`, sin lock) → `{ candidato, descartes, firma, cuposDisponibles }` o `{ candidato: null, descartes }` si cola vacía.
- `puertos.ts`: `Transaccion.guardarSaltos`, `Consultas.saltosDeOferta(id)`, `saltosDeVehiculos(ids, desde, hasta)`, `saltosPorClase(clase, mes)`. Adaptadores `memoria.ts` y `persistencia/postgres.ts`.

**Persistencia.** `infra/postgres/migrations/0017_oferta_saltos.sql` (append-only, RULE-025): `oferta_saltos(id uuid pk, oferta_id uuid not null references ofertas, vehiculo_id uuid not null references vehiculos, posicion int not null, motivo text not null check (motivo in (los 7)), detalle text, created_at timestamptz not null default now(), unique (oferta_id, vehiculo_id))`; índices `(vehiculo_id, created_at desc)`, `(oferta_id)`; trigger inmutable como `audit_log`; RLS: member solo `vehiculo_id = any(app.vehiculo_ids)`, resto según lectura de `ofertas`. `0018_metricas_saltos.sql`: `metricas_mes` gana `saltadas` y `saltadas_por_motivo jsonb`. Check de `notificaciones_outbox.evento` ampliado con los tres avisos nuevos.

**Shared.** `codigos-error.ts`: `CANDIDATO_CAMBIO` (409). `esquemas`: `OfrecerSchema = { esperado?: { vehiculoId, firma } }`. `vistas.ts`: `DescarteSchema`, `VistaSiguienteSchema { candidato: { vehiculoId, placa, etiqueta, posicion } | null, descartes, firma, cuposDisponibles, calculadoEn }`, `VistaActaSchema { ofertaId, at, claseCola, cliente, requerimiento, elegida, saltos[], parametrosAplicados, actorRol }`, `VistaSaltoPropioSchema { at, placa, motivo, detalle, cliente, destino, ofertaId }`, `VistaActaMesSchema`; `MetricaPlacaSchema` + `saltadas`, `saltadasPorMotivo`. `parametros.ts`: `aviso_proximo_turno_posiciones: int` (default 2). `notificaciones.ts`: eventos `cola.proximo`, `documento.bloquea_turno`, `cola.sin_elegibles`.

**API (`apps/api/src/rutas/operacion.ts`, contrato en `openapi/contrato.ts`, `docs/openapi.json` regenerado).**
- `GET /requerimientos/:id/siguiente` (guard `ofertas R`, no member) → `VistaSiguiente`; caché en memoria por (clase, clienteId) durante 1,5 s para no evaluar la clase 5 veces por ciclo.
- `POST /requerimientos/:id/ofertas` parsea `OfrecerSchema` y pasa `esperado` (idempotencia existente intacta).
- `GET /ofertas/:id/acta` (`ofertas R`; member solo si la oferta o uno de los saltos es de sus placas; viewer con etiqueta enmascarada `R*`) → `VistaActa`; para member la lista de saltos ajenos se reduce a un conteo agregado ("3 placas delante de ti no salieron").
- `GET /me/saltos?desde=&hasta=` (own) → `VistaSaltoPropio[]`; entra en la caché NetworkFirst `mi-turno-lectura` (patrón `/api/v1/me/*` ya cubre, se añade test).
- `GET /colas/:clase/saltos?mes=` (`cola R`) → agregado por placa y motivo. `GET /colas/:clase/acta-mes?mes=` (`cola R`, JSON) y `GET /export/acta-mes.html?clase=&mes=` (`export A`, HTML imprimible con la misma marca de agua que el CSV, auditado `export.acta_mes`, sin hash): equidad con "saltada por motivo", intervenciones con motivo, TR del mes.
- `tablero/calcular.ts`: `saltadas`, `saltadasPorMotivo` por placa y `saltosPorMotivo` global.
- `notificaciones/avisos.ts` (job del minuto, claves idempotentes): `cola.proximo:{vehiculoId}:{ciclo}` cuando una placa entra en las primeras N posiciones elegibles ("Estás de 2.º: alista el vehículo"); `documento.bloquea_turno:{vehiculoId}:{documentoId}:{ciclo}` a asociado + admin_hseq cuando una placa en posición ≤3 tiene documento bloqueante vencido; `cola.sin_elegibles:{requerimientoId}:{fecha}` a admin_ops + admin_hseq cuando un requerimiento con cupo no tiene candidato. Plantillas sin PII más allá de la placa. La plantilla de `oferta.abierta` añade "Te tocó porque: primera placa elegible para HLB".

**Web.** `PanelSiguiente.tsx` (queryKey `['siguiente', clase, clienteId]`, mismo `refetchInterval` que la cola; estados esqueleto / "Nadie elegible: 3 con documento vencido, 1 en servicio" / sin cupos); `Ops.tsx` envía `esperado` desde el panel y ante `CANDIDATO_CAMBIO` invalida `cola` y `siguiente`, resalta la nueva cabeza y avisa (el cliente ya solo reintenta `COLA_LOCKED`, cliente.ts:46: se añade test de que no reintenta 409 `CANDIDATO_CAMBIO`); `ActaTurno.tsx` (Drawer desde `oferta-abierta`, `tr-item`, `aviso-oferta.abierta`, Tablero); `Me.tsx` sección `mis-saltos` con `textoSalto(motivo)` en lenguaje llano ("te saltaron por SOAT vencido", "ya tenías el TR-41947 en curso", "no estás habilitado para HLB") y atajo a Mis documentos si el motivo es documental; `Tablero.tsx` columna "Saltadas" al final + barras por motivo + botón "Acta del mes" → `/libro/:clase/acta?mes=` (`ActaMes.tsx`, `@media print`, botones Imprimir y Descargar HTML); `utils/formato.ts`: `textoSalto`, `textoMotivoSalto`, `textoAccionAudit`; `api/tipos.ts` reexporta las vistas.

**Tests.**
- Dominio: `evaluarCola` devuelve descartes en orden de posición con motivo y detalle; con la semilla, SPS413 sale saltada por `VEHICULO_NO_HABILITADO` y FST189 elegida; `esperado` equivocado → `CANDIDATO_CAMBIO` sin oferta, sin saltos consumidos y sin filas de audit; `COLA_VACIA` sigue llevando descartes; la oferta crea N saltos y el acta los reconstruye; `firmaCola` cambia si cambia el orden, una oferta abierta o un salto pendiente.
- API: viewer lee acta con etiqueta enmascarada y sin cédula; member solo ve saltos propios y el agregado; hseq no lee `/siguiente`; 20 `POST …/ofertas` paralelos con la misma firma: una gana, el resto `CANDIDATO_CAMBIO` o `COLA_LOCKED`; parámetro `aviso_proximo_turno_posiciones` audita en PATCH; los tres avisos son idempotentes por clave; `openapi.test.ts` cruza las rutas nuevas.
- DB: RLS y append-only de `oferta_saltos`; check ampliado de la outbox; `metricas_mes` con columnas nuevas.
- Web (Vitest + Testing Library): `PanelSiguiente` (candidato, descartes, vacío), `textoSalto`, `CuentaRegresiva` con reloj falso, cliente no reintenta 409, `ActaMes` renderiza con datos del seed.
- e2e nuevo (mismo archivo): superadmin crea por API un usuario member para `a-01` con `veh-SPS413` (en la semilla SPS413 es de a-01 sin usuario; `member.swi750` tiene SWI750, seed.ts:44 y :264); ops ve en el panel "Saldrá FST189" y "SPS413" antes de ofrecer; ofrece; abre `Ver acta` y lee "SPS413 · No habilitada"; el member nuevo ve en `mis-saltos` "No habilitada para HLB"; el veedor abre el Acta del mes y ve "Saltadas 1" en SPS413. Los 15 e2e existentes no cambian.

---

## 6. Tareas (en orden de ejecución; done siempre = `pnpm check` verde + evidencia en `ISSUES.md` + ARCHITECTURE actualizado si toca rutas o §7)

### A · Sistema de diseño
| TASK | Título | Prio | Esf. | Criterio de done verificable |
|---|---|---|---|---|
| 0044 | Tokens, base y tipografía "Llano Abierto" (light/dark, foco, movimiento, densidades, Inter autohospedada, Marca e iconos PWA) | crítica | M | `estilos/tokens.css` + `base.css` + `componentes.css`; Inter en `public/fonts` precacheada; `Marca.tsx` e `icono-192/512.png` regenerados; test unitario de contraste de todos los pares de tokens ≥ 4,5:1 en ambos modos; `.badge.ambar/.gris` corregidos; `.tabla tr.activo` y `pre` de auditoría estilizados; `pnpm test:e2e` verde sin tocar marcado; captura claro/oscuro de /ops y /me en `docs/ui/` |
| 0045 | Primitivos `ui/*`: Icono, Boton, Chip, ChipElegibilidad, Placa, CodigoTr, Tarjeta, Campo, Pestanas, TablaDensa, Tooltip, Esqueleto, EstadoVacio, EstadoError, Avatar, TileMetrica, SelectorTema | crítica | L | Cada componente con test de Testing Library (roles ARIA, teclado en Pestanas, copiar en CodigoTr, Tooltip por foco/Esc); ruta `/dev/ui` solo en `import.meta.env.DEV` con todos los estados; `data-testid` pasado al control interno; enum crudo eliminado de Ops.tsx:237 y Me.tsx:155 |
| 0046 | Dialogo, DialogoMotivo, DialogoConfirmar, HojaInferior, Drawer y Avisador: adiós a `window.prompt/confirm` | alta | M | `grep window.prompt\|window.confirm apps/web/src` vacío; sustituidos Ops.tsx:222, Hseq.tsx:495, Usuarios.tsx:217, Admin.tsx:104, Parametros.tsx:188; en el **mismo commit** e2e l. 255 y 381 pasan de `page.once('dialog')` a `click` en `dialogo-confirmar`; mensajes con testid siguen inline; test de DialogoMotivo (≥3 caracteres, Esc cancela) |
| 0047 | AppShell: BarraLateral/raíl, PaginaCabecera con IndicadorActualizacion, BarraInferior, MenuUsuario con `textoRol`, navegación única por `useMediaQuery`, React.lazy por ruta, `useRefresco`, `useReloj` | alta | M | Todos los `nav-*`, `usuario-actual`, `logout`, `sin-conexion` y el texto `Avisos`/`Avisos (n)` conservados; e2e verde a 1280×720; e2e nuevo a 390×844 que entra como member y navega por la barra inferior; `vite build` muestra que el chunk de /me no incluye Finance/Hseq/Admin; `document.title` por pantalla; enlace "Saltar al contenido" |

### B · Pantallas
| TASK | Título | Prio | Esf. | Criterio de done |
|---|---|---|---|---|
| 0048 | Sala de turnos v2 (tres paneles con scroll interno, TarjetaRequerimiento + BarraCupos, TablaDensa con búsqueda/solo elegibles/ficha en Drawer, LineaTiempo con CuentaRegresiva y CodigoTr, "Nuevo requerimiento", cancelar TR / no tramitar, `GET /trs?desde=`, refresco adaptativo) | crítica | L | e2e verde; todos los testid y textos de la sala intactos (primer `td` = posición); e2e nuevo: ops crea requerimiento MM, ofrece, cancela el TR y ve la reoferta; prueba con semilla de 60 placas (script en `scripts/`) sin scroll de página a 1366×768; axe sin violaciones serias en /ops; peticiones/min por pestaña medidas < 40 |
| 0049 | Mi turno v2 móvil (OfertaCard ámbar con CuentaRegresiva y bloque de declinación siempre visible, hero de posición con MedidorPosicion, ChipElegibilidad propia, Semaforo, Mis TR con CodigoTr, vibración/título/toast al llegar oferta, botones sin red) | crítica | M | e2e de member y PWA offline verdes; `mi-posicion` con texto literal; Lighthouse móvil (Moto G4, 3G rápido) rendimiento ≥ 90 y accesibilidad ≥ 95; chunk /me + shell ≤ 120 KB gzip; viewport 360×640 sin scroll horizontal |
| 0050 | HSEQ, Finanzas, Tablero, Avisos, Login y Entrar sobre el sistema | media | L | Todos los testid `hseq-*`, `ficha-*`, `doc-*`, `hab-*`, `finance-*`, `tablero-*`, `aviso-*`, `pref-*`, `login-*`, `entrar-*` intactos; fila seleccionada visible en Finanzas; fecha de Avisos por `formatearFechaHora`; e2e verde; capturas claro/oscuro en `docs/ui/` |
| 0051 | Administración, Usuarios, Parámetros y Auditoría sobre el sistema | media | M | `admin-*`, `override-*`, `reset-*`, `usuario-*`, `param-*`, `audit-*` intactos; textos `120 → 90` y `Reset de cola` conservados; sin lista numérica de posición; e2e verde |
| 0052 | Accesibilidad, rendimiento y regresión visual en CI | alta | M | `@axe-core/playwright` sobre /login, /ops, /me, /hseq, /finance, /tablero, /notificaciones, /admin en claro y oscuro sin violaciones serias/críticas; test de teclado en la sala (tablist, Tooltip, Dialogo); test de contraste en `pnpm check`; límite de tamaño por chunk que rompe el build; Lighthouse CI móvil para /me y /ops (90/95); `toHaveScreenshot` a 390×844 y 1280×720 con máscaras sobre relojes, umbral 0,2 %, en el job `e2e` |

### C · Innovación (Acta de turno)
| TASK | Título | Prio | Esf. | Criterio de done |
|---|---|---|---|---|
| 0053 | Motor explicable: `evaluarCola`, `siguienteElegible` con descartes, `previsualizarOferta`, `esperado` + `firmaCola` + `CANDIDATO_CAMBIO` sin efectos, `guardarSaltos` en `crearOferta`, `oferta.crear.after` enriquecido | crítica | L | Tests de dominio de §5 (incl. 409 sin efectos verificado por ausencia de audit y de saltos consumidos); migración 0017 con RLS y append-only; adaptadores memoria y Postgres; `pnpm test:db` verde; ARCHITECTURE §5.5 actualizado |
| 0054 | API del acta: `/requerimientos/:id/siguiente`, `OfrecerSchema`, `/ofertas/:id/acta`, `/me/saltos`, `/colas/:clase/saltos`, tablero con `saltadas`, contrato OpenAPI | crítica | M | Tests de API por rol y de 20 paralelos con misma firma; `openapi.test.ts` verde; `docs/openapi.json` regenerado; ARCHITECTURE §6.4 y §8 |
| 0055 | Web del acta: PanelSiguiente, `esperado` en un clic, manejo de `CANDIDATO_CAMBIO`, ActaTurno en Drawer, `mis-saltos`, `/me/historial`, columna "Saltadas" y barras por motivo en Tablero | alta | M | e2e nuevo de §5 verde y los 15 existentes intactos; `tablero-placa-*` con la nueva celda al final (nth 1/2/5 iguales); tests de PanelSiguiente, textoSalto y no-reintento del 409 |
| 0056 | Acta del mes imprimible: `/colas/:clase/acta-mes`, `/export/acta-mes.html` con marca de agua auditada, `ActaMes.tsx` con `@media print` y botón en Tablero | media | M | Test de API (export auditado, viewer con PII enmascarada); e2e: viewer abre el acta del mes y ve "Saltadas"; captura de impresión en `docs/ui/` |

### D · Backend que la soporta
| TASK | Título | Prio | Esf. | Criterio de done |
|---|---|---|---|---|
| 0057 | Alertas proactivas por outbox: `cola.proximo`, `documento.bloquea_turno`, `cola.sin_elegibles`; parámetro `aviso_proximo_turno_posiciones`; plantillas; pantalla Avisos y Parámetros | alta | M | Tests en `notificaciones.test.ts` (top-2 recibe `cola.proximo` una vez por ciclo; SOAT vencido en posición 3 avisa a asociado y HSEQ; requerimiento con cupo y sin elegibles avisa a ops + HSEQ); check de outbox ampliado en `pnpm test:db`; `param-aviso_proximo_turno_posiciones` en Parámetros |
| 0058 | Reloj de servidor y CuentaRegresiva sincronizada (cabecera `date` en `api()`, `useReloj`, aviso de desfase > 5 min) | alta | S | Test con reloj falso (desfase +90 s, cambio de tono 15/5, anuncio aria-live, "Expirada"); sin peticiones nuevas a la API |
| 0059 | Catálogo de motivos de bloqueo HSEQ (en vez de texto libre) para que el `detalle` del acta sea legible y sin datos clínicos | media | S | Tabla/parámetro de catálogo, `hab-*` con select + nota, `detalle` nunca contiene tipos de documento médicos (test) |
| 0060 | Tiempo real opcional: `GET /api/v1/eventos` por SSE (LISTEN/NOTIFY sin PII, replay por `Last-Event-ID`) con polling de respaldo; el IndicadorActualizacion pasa a "En vivo" | media | L | Solo tras 0044-0058; test de API (member no recibe eventos ajenos); e2e existente verde con polling a 60 s; runbook en ARCHITECTURE §14; nada empeora si el stream cae |

---

## 7. Riesgos y mitigación

- **Romper el contrato e2e (testids duplicados, textos, índices).** Una sola navegación montada por `useMediaQuery`; `mi-posicion` conserva la frase literal como pie; `ofrecer-<id>` sigue siendo un clic (el `esperado` lo toma del panel ya cargado; si el panel aún no cargó, se ofrece sin `esperado`); "Saltadas" va como 10.ª celda; los dos `page.once('dialog')` se cambian en la misma TASK-0046; `nav-avisos` mantiene texto exacto; regresión visual (0052) desde la primera pantalla migrada.
- **Carrera vista previa → oferta.** `firma` + `CANDIDATO_CAMBIO` comprobados antes de `consumirSaltos` y sin audit; el 409 no se reintenta en el cliente (test); test de 20 paralelos con la misma firma.
- **Coste de `siguiente`.** Caché de 1,5 s por (clase, cliente) en la API; el panel comparte cadencia con la cola; medición de peticiones/min en 0048.
- **Crecimiento de `oferta_saltos`** (~N-1 filas por oferta, ≈1.800/día con 60 placas): índices por vehículo y oferta; si preocupa, compactar en `ofertas.acta jsonb` y dejar en tabla solo (oferta, vehículo, motivo).
- **Privacidad y §3.2.** Member solo ve sus saltos + conteo agregado (own); viewer ve el acta con etiqueta enmascarada `R*` y nunca `audit_log` crudo (el acta se deriva de `ofertas` + `oferta_saltos`, que ya lee con R); `detalle` sin datos clínicos (0059); no se expone la cola completa al asociado (decisión gremial que queda fuera).
- **Offline y datos móviles.** `/me/saltos` bajo la caché NetworkFirst existente; polling pausado con pestaña oculta; una sola fuente de 95 KB precacheada; chunk de /me ≤ 120 KB gzip con límite en el build; sin imágenes raster; inputs a 16 px.
- **Rendimiento de la sala.** Scroll interno por panel, `TablaDensa` con filas de altura fija, container queries en lugar de viewport, resaltado de cambios solo con `@starting-style`; prueba con 60 placas.
- **Accesibilidad.** Contraste verificado por test de tokens; `:focus-visible` global; `ChipElegibilidad` con Tooltip accesible en vez de `title`; `role=timer` y anuncios acotados (15/5/1) para no saturar el lector; axe en CI.
- **Alcance.** Orden estricto A → C/D → B: el acta y el rediseño de sala y Mi turno salen antes que HSEQ/Finanzas/Admin; SSE (0060) es la última y opcional; nada de hash encadenado ni compartir por WhatsApp (§21).