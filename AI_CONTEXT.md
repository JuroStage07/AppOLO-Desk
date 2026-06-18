# AI_CONTEXT.md — Documento vivo de UI/UX (AppoloDesk)

> Propósito: conservar todo el contexto de las mejoras de UI/UX para que cualquier
> agente de IA pueda continuar el trabajo sin perder información.
> **Antes de iniciar un bloque grande de cambios, lee este archivo completo.**
> Actualízalo después de cada cambio o decisión relevante.

Última actualización: **2026-06-15** · Iteración: **4 (Fase C completada)**

---

## 1. Resumen del proyecto

- **Producto:** AppoloDesk — SPA interna multi-tenant para operaciones logísticas
  (recepción, despacho, mantenimiento/OTs, zona franca, seguridad/SSO, EPA,
  documentación, MRP). UI en **español**.
- **Stack:** React 19 + Vite, Firebase (Auth + Firestore + Storage + Functions),
  React Router. Iconos `lucide-react`. **Sin suite de tests.** Estilos inline
  (objetos JS) — no hay CSS-in-JS lib ni Tailwind; los tokens viven en
  `src/styles/theme.js`.
- **Estructura general:**
  - `src/components/ui/` — design system (barrel en `index.js`). ~32 primitivas.
  - `src/styles/theme.js` — **única fuente de verdad** de tokens (colores, radios,
    sombras, `CONTAINER_MAX`, `FONT_STACK`).
  - `src/pages/<Módulo>/` — páginas por módulo de negocio.
  - `src/config/workAreas.jsx` — modelo de navegación (Área › Módulo › Feature).
  - `src/auth/` — `AuthProvider`, guards de ruta y tenant.
  - `src/App.jsx` — todas las rutas en un solo lugar.
- **Objetivo de los cambios:** que la app se sienta totalmente profesional,
  consistente, intuitiva para usuarios nuevos, accesible y mantenible —
  sin romper funcionalidad. Cambios grandes están explícitamente permitidos,
  pero deben hacerse de forma ordenada y por fases con aprobación previa.

### Reglas de arquitectura que NO se deben romper (críticas)

- **Auth/tenant:** `AuthProvider` es la verdad en runtime; no existe estado
  "logueado sin perfil". `localStorage["appolo_profile"]` y el perfil de
  Firestore son dos fuentes paralelas → mantener sincronizadas.
- **Multi-tenant:** cada doc lleva `tenantId` + `company`. Reglas en
  `firestore.rules` + filtro defensivo en `src/utils/dataScope.js`.
- **Permisos:** `role` + `permisos{}` + flag `epaAdmin` en `profiles/{uid}`.
- No reintroducir `FooterNote`/tarjetas "Tip" (fueron removidas a propósito).

---

## 2. Estado actual

### 2.1 Trabajo de UX ya completado (auditoría junio 2026 — verificado 2026-06-15)

> El núcleo del problema diagnosticado entonces fue **consistencia + feedback**,
> no estética. Lo siguiente YA está hecho y NO debe rehacerse:

1. ✅ **Toast/Confirm del UI-kit** reemplazan a `alert()`/`confirm()` nativos
   (~100 llamadas). Usar `useToast()` / `useConfirm()`. Verificado: los matches
   restantes de `confirm(` son llamadas al hook, no nativas.
2. ✅ **Topbar unificado + sub-barra de utilidad** con breadcrumbs
   (`Breadcrumbs.jsx` + `routeTrail.js`) y cuenta/logout (`TopbarAccount.jsx`)
   en páginas internas. Opt-out con `<Topbar utilityBar={false}>`.
3. ✅ **Estados universales** loading/empty/error: primitivas `ErrorState`,
   `Skeleton` (+ `Skeleton.List`/`Skeleton.Cards`), `EmptyState` con `center`.
   Convención de render: **error → loading → empty → list**.
4. ✅ **Breadcrumbs** ("dónde estoy").
5. ✅ **Validación inline de formularios** (`Field` con `error`, `aria-invalid`,
   `required`) + **tablas responsive** (`TableScroll`).
6. ✅ **Command palette ⌘/Ctrl+K** (`CommandPalette.jsx`, montado en `App.jsx`).
7. ✅ Migración de headers bespoke al `Topbar` compartido en varias páginas
   (PanelEquipos, EquipoInfo, AccionDetalle, OTsSolDetalle).

### 2.2 UI kit (primitivas disponibles — `src/components/ui/index.js`)

Layout: `Shell`, `Topbar`, `Brand`, `Main`/`Container`, `Hero`/`SectionTitle`.
Navegación: `AreasSidebar`, `SidebarAreaIcon`, `Breadcrumbs`, `TopbarAccount`,
`CommandPalette`, `PinsFlyout`.
Cards/grids: `Card`, `ModuleCard`, `ModuleGrid`, `KpiCard`/`KpiGrid`, `RowCard`,
`QuickCard`, `IconBox`.
Controles/estado: `Button` (+ `PrimaryButton`/`SecondaryButton`/`GhostButton`),
`Badge`, `StatusPill`, `Chip`/`ChipsRow`, `SearchInput`, `Field`, `TableScroll`,
`Sheet`, `EmptyState`, `ErrorState`, `Skeleton`, `Spinner`.
Feedback: `ToastProvider`/`useToast`, `ConfirmProvider`/`useConfirm`.
Tokens: `theme` (namespace) + `themeDefault`.

### 2.3 Problemas de UI/UX detectados (diagnóstico 2026-06-15)

| # | Hallazgo | Severidad | Evidencia |
|---|----------|-----------|-----------|
| D1 | **31 archivos redefinen `ACCENT="#089F8A"` (y otros hex) localmente** en vez de importar de `theme.js`. Riesgo: si cambia la marca, hay 31 puntos a tocar; deriva de color. | Alta | grep `ACCENT = "#"` → 31 archivos |
| D2 | El **hub** (`AreasTrabajoHubPage.jsx`, 2761 líneas) usa su propio objeto de tokens `T` (fuente `Inter`, otros grises) distinto de `theme.js` (fuente `system-ui`). Doble sistema visual. | Alta | `AreasTrabajoHubPage.jsx:42-59` |
| D3 | `theme.js` **no tiene escala tipográfica ni de espaciado** formal. Cada página inventa tamaños/paddings → inconsistencia de jerarquía y ritmo vertical. | Media-Alta | `theme.js` (solo color/radio/sombra) |
| D4 | **Accesibilidad:** botones solo-ícono sin `aria-label` consistente; `StatusPill` depende solo de color; falta auditar foco/contraste. | Media | nota de auditoría previa |
| D5 | **Responsive:** la rueda radial del hub y varias tablas/landing necesitan auditoría móvil. | Media | pendiente de validar |
| D6 | **UX del hub radial:** patrón novedoso (rueda) — evaluar discoverability vs. una landing de tarjetas más convencional. | A discutir | decisión de producto |
| D7 | Páginas con header bespoke aún sin migrar al `Topbar` (el hub es el caso mayor; tiene su propio header+logout por ser landing raíz). | Baja-Media | memoria UX, item abierto |

### 2.4 Decisiones ya tomadas (heredadas)

- Look de referencia = "estilo Recepción"; todo el kit lo refleja (`theme.js`).
- Identidad de usuario vive solo en la sub-barra de cuenta (no duplicar nombre).
- "Salud Ocupacional" → renombrada a **Seguridad** (`/seguridad/*`); `/salud/*`
  redirige por compatibilidad. Existe placeholder "Salud Ocupacional" (coming soon).
- Navegación: editar `modules` en `workAreas.jsx`; `subModules` es derivado.

---

## 3. Cambios realizados

> (Aún no se han aplicado cambios de código en esta sesión — solo diagnóstico.)

### Iteración 0 — 2026-06-15
- **Archivos modificados:** creación de `AI_CONTEXT.md` (este archivo).
- **Qué:** diagnóstico inicial de UI/UX y propuesta de plan por fases.
- **Por qué:** establecer línea base y documento vivo antes de cambios grandes.
- **Impacto UI/UX:** ninguno aún (documentación).
- **Pendiente de validar:** aprobación del plan por el usuario.

### Iteración 1 — 2026-06-15 — **Fase A: escala tipográfica + espaciado** ✅
- **Archivos:** `src/styles/theme.js`.
- **Qué:** añadidos (aditivo, no rompe nada):
  - Escala tipográfica: `FS_XS..FS_3XL` (11→34px), pesos `FW_REGULAR..FW_EXTRABOLD`,
    line-heights `LH_TIGHT..LH_RELAXED`.
  - Escala de espaciado (grilla 4px): `SPACE_1..SPACE_16`.
  - Helper de color: `withAlpha(hex, alpha)` + `accentAlpha(alpha)` para derivar
    tintes de marca a cualquier opacidad desde el único `ACCENT`.
  - Todos agregados al objeto `theme` exportado.
- **Por qué:** dar vocabulario único de tipografía/espaciado (antes inexistente)
  y permitir derivar tintes de marca sin hardcodear `rgba(8,159,138,…)`.
- **Impacto:** ninguno visual aún; base para futuras páginas.
- **Validado:** `npm run build` limpio.

### Iteración 2 — 2026-06-15 — **Fase B: consolidación de color (D1)** ✅
- **Archivos (30):** todas las páginas/archivos que redefinían colores de marca
  localmente — Despacho (2), Documentacion, EPA/AperturasFinalizadasEPA,
  Recepcion/MetricaRecepcion + AccionDescarga (2), Zona Franca (2),
  ServiciosGenerales (3), Mantenimiento Equipos (2) + OTs (4), SSO/Seguridad (8),
  Login, ConfigRegionPage, auth/RequireAuth, components/ui/Topbar.
- **Qué:**
  - Eliminadas las redefiniciones locales que coincidían exacto con `theme.js`
    (`ACCENT`, `SLATE`, `ACCENT_SOFT="rgba(8, 159, 138, 0.12)"`, `SURFACE`) y
    sustituidas por `import { … } from ".../styles/theme"`.
  - Variantes de marca con otra opacidad (`rgba(8,159,138,0.10)`, `0.25`, `0.12`
    sin espacios) convertidas a `accentAlpha(x)` — **salida CSS idéntica**, cero
    cambio visual, pero ahora derivan del único `ACCENT`.
  - Colores NO de marca (`BLUE`, `RED`, `AMBER`, `WARN*`, `DANGER*`) intactos.
- **Por qué:** un cambio de marca ahora se hace en 1 lugar (`theme.js`), no en 31.
- **Impacto UI/UX:** cero cambio visual; consistencia/mantenibilidad.
- **Riesgos/pendientes:**
  - `src/utils/metricaRecepcionExcelPro.js` **excluido a propósito** (genera
    colores ARGB para Excel, no es UI) — sigue con `ACCENT`/`SLATE` locales.
  - `WARN`/`DANGER` locales usan valores distintos a los del theme
    (`WARN #D97706` vs theme no tiene WARN sólido; `DANGER #DC2626` vs theme
    `#B91C1C`). Candidato a unificar en una futura fase (añadir WARN/AMBER al theme).
- **Validado:** `npm run build` limpio; sin `no-undef`/imports sin usar de tokens.
  (Los errores de `npm run lint` son preexistentes: set-state-in-effect,
  no-useless-escape, exhaustive-deps — ninguno relacionado.)

### Iteración 3 — 2026-06-15 — **Fase D: accesibilidad (D4)** ✅
- **Archivos:** `src/index.css`, `src/components/ui/StatusPill.jsx`, +6 páginas de
  Mantenimiento/MRP y 3 de Seguridad/Zona Franca/Hub (solo `aria-label`).
- **Qué:**
  1. **Foco accesible global** (`index.css`): anillo de marca `:focus-visible`
     (`outline: 2px solid ACCENT; outline-offset: 2px`) para TODO elemento
     interactivo (antes solo `button`, con anillo webkit). `:focus:not(:focus-visible)`
     quita el outline en clics de ratón → foco limpio solo en teclado/AT.
  2. **Movimiento reducido**: `@media (prefers-reduced-motion: reduce)` desactiva
     animaciones/transiciones (vestibular). 
  3. **color-scheme: light** (antes `light dark`): controles nativos (select,
     scrollbar, date picker) se renderizan claros y consistentes; corregido el
     `:root` que tenía texto blanco + fondo `#242424` heredado de Vite.
  4. **Colores de marca**: links y hover de botón pasaron de azul-violeta Vite
     (`#646cff`/`#535bf2`) a `ACCENT`/`ACCENT` oscuro.
  5. **StatusPill** ahora muestra ícono por defecto según tono semántico
     (ok=CheckCircle2, warn=AlertTriangle, danger=XCircle) → el estado no depende
     solo del color (WCAG 1.4.1). `icon` explícito sobreescribe; `icon={null}`
     lo oculta. Añadido `role="status"`.
  6. **aria-label** añadido a ~21 botones solo-ícono (Eye→"Ver detalle",
     Trash2→"Eliminar", X→"Cerrar", Plus→"Agregar", etc.), reusando el `title`
     existente cuando lo había.
- **Por qué:** navegación por teclado visible, respeto a preferencias del SO,
  estado no-solo-color, y nombres accesibles en acciones de ícono.
- **Impacto UI/UX:** **cambio visual menor esperado** → los `StatusPill` de
  ok/warn/danger ahora muestran un ícono pequeño antes del texto. Verificar que
  se ve bien en las listas (Despacho, OTs, Aperturas). Foco ahora visible al
  tabular (esto es lo deseado).
- **Riesgos/pendientes:**
  - Botones de cerrar/limpiar que usan el **glifo de texto `✕`** (no ícono lucide)
    quedaron sin `aria-label` (en `ControlMarcas.jsx`, `AdministrarVisados.jsx`,
    modales de Documentacion/PanelEquipos). Lector de pantalla anuncia el glifo;
    follow-up menor: darles `aria-label="Cerrar"`/"Limpiar".
  - `MetricaRecepcion.jsx` es enorme (>256KB) y no se pudo escanear 100% para
    aria-labels; no se hallaron botones solo-ícono en lo revisado.
- **Validado:** `npm run build` limpio.

### Iteración 4 — 2026-06-15 — **Fase C: unificar tokens del hub (D2)** ✅
- **Archivos:** `src/pages/AreasTrabajoHubPage.jsx`.
- **Decisión de diseño:** el usuario eligió MANTENER el diseño radial; solo unificar
  tokens. Enfoque = **redefinir el objeto local `T` derivándolo de `theme.js`**
  (en vez de reescribir el archivo). `T` se vuelve un adaptador delgado sobre el
  theme → las ~167 referencias `T.x` quedan intactas y propagan el cambio.
- **Qué:**
  - `T.accent→ACCENT`, `accentSoft→accentAlpha(0.1)`, `accentGlow→ACCENT_SHADOW`,
    `bg→BG`, `surface→SURFACE`, `surfaceAlt→SURFACE_INSET`, `border→BORDER`,
    `text→TEXT`, `textSecondary→SLATE_DEEP`, `textMuted→MUTED`, `font→FONT_STACK`.
  - Sin token en theme aún (quedan literales): `accentDark "#06776A"`,
    `borderSoft` (hairline translúcido), las 3 sombras custom.
  - `MENU_ACTIONS` "Mis Pin": brand `"#089F8A"`/`"rgba(8,159,138,0.12)"` →
    `ACCENT`/`accentAlpha(0.12)`. Los otros acentos (azul/morado/naranja) son
    paleta de categoría intencional → literales.
- **Hallazgo importante:** la fuente `Inter` NO está cargada en el proyecto
  (sin `@font-face`/Google Fonts), así que `'Inter'` ya caía a `system-ui`.
  → cambiar a `FONT_STACK` es **visualmente idéntico**. (Misma situación en
  `HomeHub.jsx` y `Dev/UpdateSupabasePage.jsx`.)
- **Impacto UI/UX:** prácticamente nulo. Cambios imperceptibles en `bg`/`border`
  (diff de 1-2 en hex). Único cambio leve: `surfaceAlt` (#F1F5F9→#F2F4FB) afecta
  tintes de hover/inset — verificar visualmente.
- **Pendientes:** `HomeHub.jsx` (/welcome) y `Dev/UpdateSupabasePage.jsx` repiten
  el patrón `T`+Inter — candidatos a la misma unificación. Añadir `accentDark`
  al theme cerraría el último literal de marca del hub.
- **Validado:** `npm run build` limpio.

---

### Verificación visual — 2026-06-15
- **Método:** `npm run dev` + Playwright headless (no hay chromium-cli; Playwright
  instalado con `--no-save`, queda en node_modules sin tocar `package.json`).
- **Alcance:** el hub (`/`) y las pantallas con `StatusPill` están tras el login
  de Firebase (producción, sin emulador) → no verificables headless sin
  credenciales. Verificado lo público (`/login`):
  - ✅ Render limpio, **sin errores de consola**.
  - ✅ Color `ACCENT` (Fase B) correcto en barra/link/botón/píldora.
  - ✅ `color-scheme: light` (Fase D) — sin controles nativos oscuros.
  - ✅ Foco visible al tabular. NOTA: inputs con estilo de foco inline propio
    (p.ej. el input de login muestra su borde teal) NO usan el `outline` global;
    el `:focus-visible` global actúa como **red de seguridad** para los que no
    tienen foco propio. Comportamiento deseado.
- **Decisión del usuario:** confiar en build + análisis para el hub/StatusPill
  (cambios de bajo riesgo por construcción). Dev server cerrado, temporales limpiados.
- **⚠️ Incidente:** durante la sesión `firestore.rules` apareció como borrado en
  `git status` (causa no identificada; no fue una edición intencional). **Restaurado**
  con `git restore firestore.rules` y verificado. Archivo crítico — vigilar.

## 4. Guía visual y de UX

### Principios acordados
- Consistencia > novedad. Componer con el UI kit, no crear wrappers bespoke.
- La app "habla de vuelta": toda acción tiene feedback (toast/confirm/estado).
- Jerarquía visual clara; ritmo vertical consistente; accesible por defecto.

### Tokens (fuente de verdad: `src/styles/theme.js`)
- **Acento:** `ACCENT #089F8A` (+ soft/border/shadow).
- **Texto:** `TEXT #0F172A`, `SLATE #64748B`, `MUTED #94A3B8`.
- **Superficies:** `SURFACE #FFFFFF`, `BG #F6F7FB`, `SURFACE_INSET #F2F4FB`.
- **Bordes:** `BORDER #E7E9F2`.
- **Estado:** OK / WARN / DANGER (bg + border) + `DANGER #B91C1C`.
- **Radios:** `RADIUS_SM 10` … `RADIUS_2XL 22`, `RADIUS_PILL 999`.
- **Sombras:** `SHADOW_CARD`, `SHADOW_CARD_HOVER`, etc.
- **Layout:** `CONTAINER_MAX 1120`, `FONT_STACK` (system-ui).
- **PENDIENTE de definir:** escala tipográfica (FS_*/peso/line-height) y escala
  de espaciado (SPACE_*) — ver Fase B.

### Reglas de estilo
- No hardcodear hex en páginas; importar de `theme.js`.
- Tablas anchas → envolver en `TableScroll`.
- Formularios → `Field` con `error`/`required`; validación inline + toast resumen.
- Estados de lista: error → loading (Skeleton) → empty → contenido.

---

## 5. Pendientes (backlog priorizado)

- [x] **D1** Migrar las redefiniciones locales de color a `theme.js`. ✅ Fase B
      (30 archivos; queda solo `metricaRecepcionExcelPro.js`, excluido a propósito).
- [x] **D2** Unificar el hub al sistema de tokens de `theme.js`. ✅ Fase C
      (diseño radial intacto; `T` ahora deriva del theme).
- [ ] Follow-up C: unificar `HomeHub.jsx` y `Dev/UpdateSupabasePage.jsx` (mismo
      patrón `T`+Inter); añadir `accentDark` al theme.
- [x] **D3** Añadir escala tipográfica y de espaciado a `theme.js`. ✅ Fase A.
      (Falta APLICAR la escala en las páginas — trabajo incremental futuro.)
- [x] **D4** Pase de accesibilidad (aria-labels, StatusPill ícono+texto, foco
      global, reduced-motion, color-scheme). ✅ Fase D.
- [ ] Follow-up D4: `aria-label` a los botones cerrar/limpiar con glifo `✕`.
- [ ] Unificar `WARN`/`DANGER` locales con el theme (añadir WARN/AMBER al theme).
- [ ] **D5** Auditoría responsive (móvil/tablet) del hub, tablas y landings.
- [ ] **D6** Decisión de producto sobre el hub radial vs. landing de tarjetas.
- [ ] **D7** Migrar headers bespoke restantes (donde aporte).
- [ ] Documentar componentes del kit (mini storybook/MD) — opcional.

---

## 6. Instrucciones para otro agente de IA

- **Cómo continuar:** lee este archivo, luego `CLAUDE.md`, luego las memorias
  `appolodesk-ux-overhaul-plan` y `nav-data-model`. Trabaja por fases; pide
  aprobación antes de cambios masivos; actualiza este archivo tras cada fase.
- **No cambiar sin revisar:** `AuthProvider.jsx`, guards de ruta, `firestore.rules`,
  `dataScope.js`, el modelo de `workAreas.jsx` (`subModules` es derivado).
- **Archivos críticos:** `src/styles/theme.js` (tokens), `src/components/ui/*`
  (kit), `src/App.jsx` (rutas), `AuthProvider.jsx`.
- **Decisiones de diseño a respetar:** look "Recepción"; identidad solo en
  sub-barra; sin `FooterNote`/Tips; toasts/confirm del kit (nunca nativos);
  rutas `/seguridad/*` con redirect de `/salud/*`.
- **Advertencias:** sin tests → validar con `npm run build` + `npm run lint`
  tras cada fase. UI en español. `Zona Franca` tiene espacio en la ruta.
</content>
</invoke>
