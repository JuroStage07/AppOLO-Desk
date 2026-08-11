> Pegá este documento completo como contexto. Describe con valores exactos el
> design system de AppoloDesk (React 19 + Vite, estilos inline con objetos JS,
> sin Tailwind ni CSS-in-JS). Todos los números son los reales del código fuente.

---

## 0. Instrucción para el modelo

Vas a aplicar el sistema de diseño **AppoloDesk** a una aplicación que ya existe.
No reescribas la lógica de negocio de la app destino: sustituí únicamente la capa
visual. Reglas duras:

1. **Los tokens son la única fuente de verdad.** Nunca escribas un hex suelto en
   una página o componente de negocio. Si necesitás un tinte del verde de marca,
   usá `withAlpha(ACCENT, α)`, no un `rgba(8,159,138,…)` literal.
2. **Estilos inline como objetos JS.** No hay clases utilitarias ni archivos
   `.css` por componente. Cada componente declara sus constantes de estilo al
   final del archivo (`const base = {...}`) y las compone con spread:
   `style={{ ...base, ...(active ? on : {}), ...style }}`. Todo componente acepta
   una prop `style` que se aplica **al final** para permitir override.
3. **Iconos: `lucide-react`, siempre.** Tamaño 14–22 px según contexto y
   `strokeWidth={2.2}` (2.5 en badges/pills chicos). Nunca emoji como icono de UI.
4. **Pesos tipográficos deliberadamente altos.** Es la firma visual del sistema:
   el cuerpo va en 650–850 y los títulos en 950–980. Un 400/500 se ve "roto"
   dentro de este lenguaje. No lo suavices.
5. **Composición, no variantes ad-hoc.** Si necesitás una superficie, usá `Card`.
   Si necesitás una grilla de módulos, `ModuleGrid`. No crees wrappers nuevos que
   dupliquen un primitivo existente.

---

## 1. Color

### 1.1 Acento de marca (NO cambia entre claro y oscuro)

Esta es una decisión central: los neutros se invierten en modo oscuro, el verde
de marca **no**. Es idéntico en ambos modos.

| Token           | Valor                        | Uso |
|-----------------|------------------------------|-----|
| `ACCENT`        | `#089F8A`                    | Color de marca: botón primario, links, estados activos, spinner |
| `ACCENT_LIGHT`  | `#26C6AC`                    | Extremo claro de gradientes |
| `ACCENT_SOFT`   | `rgba(8, 159, 138, 0.12)`    | Relleno suave: badges accent, IconBox accent, chips activos |
| `ACCENT_BORDER` | `rgba(8, 159, 138, 0.35)`    | Borde del botón primario y de cards accent |
| `ACCENT_SHADOW` | `rgba(8, 159, 138, 0.28)`    | Base de `SHADOW_ACCENT` |

Hover de link: `#06776A` (verde más oscuro).

Helper obligatorio para derivar opacidades:

```js
export function withAlpha(hex, alpha) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
export const accentAlpha = (alpha) => withAlpha(ACCENT, alpha);
```

### 1.2 Neutros: variables CSS con fallback

Los neutros **no** son constantes: son referencias a variables CSS, para que el
cambio claro/oscuro no exija tocar ni un componente. El segundo argumento es el
fallback (igual al valor claro) por si la hoja aún no cargó.

```js
export const TEXT        = "var(--c-text, #0F172A)";
export const SLATE_DEEP  = "var(--c-text-secondary, #475569)";
export const MUTED       = "var(--c-muted, #94A3B8)";
export const SURFACE     = "var(--c-surface, #FFFFFF)";
export const SURFACE_SOFT   = "var(--c-surface-soft, #FBFCFF)";
export const SURFACE_INSET  = "var(--c-surface-inset, #F2F4FB)";
export const SURFACE_ALT    = "var(--c-surface-alt, #F1F5F9)";
export const BG          = "var(--c-bg, #F6F7FB)";
export const BORDER      = "var(--c-border, #E7E9F2)";
export const BORDER_SOFT = "var(--c-border-soft, #EEF0F7)";
export const SURFACE_TRANSLUCENT = "var(--c-surface-translucent, rgba(255,255,255,0.85))";
export const BG_TRANSLUCENT      = "var(--c-bg-translucent, rgba(246,247,251,0.97))";
export const SUBBAR_BG   = "var(--c-subbar, rgba(248,250,252,0.7))";
export const OVERLAY     = "var(--c-overlay, rgba(15,23,42,0.4))";

// SLATE queda como hex crudo a propósito: alimenta withAlpha() (que parsea hex)
// y los exportadores a canvas/Excel, y se lee aceptablemente en ambos modos.
export const SLATE = "#64748B";
```

### 1.3 Paleta claro / oscuro

| Variable | Claro | Oscuro |
|---|---|---|
| `--c-bg` | `#F6F7FB` | `#0B0F12` |
| `--c-surface` | `#FFFFFF` | `#14181D` |
| `--c-surface-soft` | `#FBFCFF` | `#171C22` |
| `--c-surface-inset` | `#F2F4FB` | `#1B2229` |
| `--c-surface-alt` | `#F1F5F9` | `#1B2229` |
| `--c-surface-translucent` | `rgba(255,255,255,0.85)` | `rgba(16,20,25,0.85)` |
| `--c-text` | `#0F172A` | `#E6EBF0` |
| `--c-text-secondary` | `#475569` | `#B4C0CC` |
| `--c-muted` | `#94A3B8` | `#7C8A99` |
| `--c-border` | `#E7E9F2` | `#272F37` |
| `--c-border-soft` | `#EEF0F7` | `#20272E` |
| `--c-bg-translucent` | `rgba(246,247,251,0.97)` | `rgba(11,15,18,0.97)` |
| `--c-subbar` | `rgba(248,250,252,0.7)` | `rgba(18,22,27,0.7)` |
| `--c-overlay` | `rgba(15,23,42,0.4)` | `rgba(0,0,0,0.55)` |

### 1.4 Paleta de estado (fija, no tematizada)

```js
export const OK_BG     = "#EAF7EE";  export const OK_BORDER     = "#C6EAD2";
export const WARN_BG   = "#FFF4DF";  export const WARN_BORDER   = "#FFE1A8";
export const DANGER_BG = "#FEECEC";  export const DANGER_BORDER = "#F6C7C7";
export const DANGER    = "#B91C1C";
```

Colores de texto asociados: ok `#1B7A3A`, warn `#8C5A00`, danger `#B91C1C`,
neutral `#334155`.

---

## 2. Mecanismo de theming

Claro es el default. Oscuro es **opt-in** vía `data-theme="dark"` en `<html>`.

```js
export const THEME_STORAGE_KEY = "appolo_theme";

export function readStoredTheme() {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

export function applyThemeToDom(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}
```

En CSS:

```css
:root { --c-bg: #F6F7FB; /* …resto de la paleta clara… */ color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; --c-bg: #0B0F12; /* …oscura… */ }
body { background: var(--c-bg); color: var(--c-text);
       transition: background-color 220ms ease, color 220ms ease; }
```

El contexto de React expone `{ theme, isDark, toggle, setTheme }`. El helper
`themeCore.js` se mantiene **sin componentes** para no romper Fast Refresh.

---

## 3. Tipografía

```js
export const FONT_STACK = "Arial, sans-serif";
```

Sí: **Arial**. Es la decisión real del proyecto, no un placeholder. Si la app
destino tiene otra familia corporativa, cambiá solo esta constante — el resto de
la escala funciona igual.

**Tamaños (px):**

| Token | px | Uso |
|---|---|---|
| `FS_XS` | 11 | microcopy, captions, notas de tabla |
| `FS_SM` | 12 | labels secundarios, chips, hints |
| `FS_BASE` | 14 | cuerpo por defecto |
| `FS_MD` | 16 | cuerpo enfatizado / inputs |
| `FS_LG` | 18 | títulos de card, subtítulos de sección |
| `FS_XL` | 22 | títulos de sección de página |
| `FS_2XL` | 28 | títulos de página |
| `FS_3XL` | 34 | hero / headline |

**Pesos** — nombrados por intención: `FW_REGULAR 400`, `FW_MEDIUM 500`,
`FW_SEMIBOLD 600`, `FW_BOLD 700`, `FW_EXTRABOLD 800`.

⚠️ **Importante:** los componentes reales usan pesos por encima de esa escala
(850, 900, 950, 980) escritos como literales numéricos. La escala nombrada llega
hasta 800; los valores altos son intencionales y frecuentes. Al portar, respetá
los números literales que se indican por componente más abajo.

**Interlineado:** `LH_TIGHT 1.15`, `LH_SNUG 1.3`, `LH_NORMAL 1.5`, `LH_RELAXED 1.6`.

---

## 4. Geometría, espaciado y sombras

**Radios (px):** `RADIUS_SM 10`, `RADIUS_MD 12`, `RADIUS 14`, `RADIUS_LG 16`,
`RADIUS_XL 18`, `RADIUS_2XL 22`, `RADIUS_PILL 999`.

**Espaciado — grilla base de 4 px:** `SPACE_1 4`, `SPACE_2 8`, `SPACE_3 12`,
`SPACE_4 16`, `SPACE_5 20`, `SPACE_6 24`, `SPACE_8 32`, `SPACE_10 40`,
`SPACE_12 48`, `SPACE_16 64`.

**Ancho máximo de contenido:** `CONTAINER_MAX = 1440`.

**Sombras** — grandes, difusas y de muy baja opacidad; nunca duras:

```js
SHADOW_CARD       = "0 12px 26px rgba(15, 23, 42, 0.06)"
SHADOW_CARD_HOVER = "0 16px 36px rgba(15, 23, 42, 0.12)"
SHADOW_SOFT       = "0 10px 24px rgba(15, 23, 42, 0.05)"
SHADOW_BTN        = "0 4px 14px rgba(15, 23, 42, 0.06)"
SHADOW_ACCENT     = "0 12px 28px rgba(8, 159, 138, 0.28)"
SHADOW_HERO       = "0 16px 40px rgba(15, 23, 42, 0.08)"
```

---

## 5. Movimiento

```css
@keyframes spin           { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes appoloShimmer  { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
@keyframes appoloConfirmIn{ from { opacity:0; transform: translateY(8px) scale(0.97); }
                            to   { opacity:1; transform: translateY(0) scale(1); } }
```

- Transición estándar de superficies: `transform 120ms ease, box-shadow 120ms ease`.
- Transición de botones: `transform 120ms ease, box-shadow 120ms ease, background 120ms ease`.
- Controles de chrome (toggles, pins): `all 150ms ease`.
- **Hover universal de superficie clickeable:** `translateY(-2px)` + subir de
  `SHADOW_CARD` a `SHADOW_CARD_HOVER`. Nada de `scale()`.
- Obligatorio respetar `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important;
  }
}
```

---

## 6. Foco y accesibilidad

Un único anillo de marca, solo para navegación por teclado:

```css
:focus-visible { outline: 2px solid #089F8A; outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }
```

Reglas que el sistema aplica y hay que mantener:
- El estado **nunca** se comunica solo por color: `StatusPill` renderiza un icono
  por defecto según el tono (WCAG 1.4.1).
- Superficies clickeables que no son `<button>` llevan `role="button"`,
  `tabIndex={0}` y manejo de `Enter`/`Espacio`.
- Los modales (`Sheet`) implementan focus-trap con `Tab`/`Shift+Tab`, foco
  inicial en el primer elemento enfocable, cierre con `Escape` y **restauración
  del foco al disparador** al cerrar.
- Los skeletons van con `aria-hidden="true"` dentro de contenedores
  `aria-busy="true"` + `aria-label="Cargando"`.
- Toasts: `role="alert"` + `aria-live="assertive"` para error; `role="status"` +
  `aria-live="polite"` para el resto.

---

## 7. Reset global (`index.css`)

```css
:root {
  font-family: Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light;
  color: var(--c-text);
  background-color: var(--c-bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html, body, #root { height: 100%; width: 100%; max-width: 100%; }
body { margin: 0; min-width: 320px; min-height: 100vh; overflow-x: hidden; }
* { box-sizing: border-box; min-width: 0; }          /* min-width:0 evita desbordes en flex/grid */
img, video, canvas, svg { max-width: 100%; }
input, select, textarea, button { font: inherit; }

@media (max-width: 768px) {
  input, select, textarea { font-size: 16px; }        /* evita el zoom automático de iOS */
  button { min-height: 40px; }
}
```

⚠️ **Trampa al portar:** el `index.css` original arrastra un default de Vite:

```css
button { border-radius: 8px; border: 1px solid transparent; padding: 0.6em 1.2em;
         font-size: 1em; font-weight: 500; background-color: #1a1a1a; cursor: pointer; }
```

Ese `background-color: #1a1a1a` pinta de negro **cualquier** `<button>` que no
pase por el kit. En AppoloDesk no se nota porque todos los botones traen estilos
inline que lo pisan, pero en una app existente con botones propios te va a
romper la UI. **No copies esa regla**; si la copiás, neutralizá al menos
`background-color` y `border-radius`.

---

## 8. Layout

### 8.1 Shell — cáscara de viewport completo

Topbar fija, solo el `<Main>` scrollea.

```js
const shellLayoutStyle = {
  width: "100%", maxWidth: "100%", boxSizing: "border-box",
  background: BG, fontFamily: FONT_STACK, color: TEXT,
  display: "grid", gridTemplateRows: "auto 1fr",
  minHeight: "100vh", height: "100dvh", overflow: "hidden",
};
const mainScrollStyle = {
  width: "100%", minHeight: 0, boxSizing: "border-box",
  overflow: "auto", WebkitOverflowScrolling: "touch",
};
```

`Shell` además congela el scroll del body mientras está montado
(`lockBodyScroll` por defecto `true`), guardando y restaurando
`overflow` / `background` / `margin` previos en el cleanup.

### 8.2 Main / Container

```js
// Main: padding por defecto "18px 16px 28px"; `center` → display grid + placeItems "start center"
const main = { width: "100%", minHeight: 0, boxSizing: "border-box",
               overflow: "auto", WebkitOverflowScrolling: "touch" };
// Container: gap por defecto 16
const container = { width: "100%", marginLeft: "auto", marginRight: "auto",
                    boxSizing: "border-box", display: "grid" };
```

⚠️ `Container` **no** aplica `CONTAINER_MAX` por sí solo: cada página pasa
`style={{ maxWidth: CONTAINER_MAX }}`. Si querés centrar todo el contenido en la
app destino, agregá `maxWidth: CONTAINER_MAX` al objeto `container` una sola vez.

### 8.3 Patrón de grilla responsiva (usalo en todas las grillas)

```js
gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`
```

El `min(100%, Xpx)` es lo que evita el desborde horizontal en móvil — no lo
omitas. Configuraciones concretas:

| Grilla | `min` | `gap` | Modo |
|---|---|---|---|
| `ModuleGrid` | 250 | 14 | `auto-fit` |
| `KpiGrid` | 200 | 12 | `auto-fit` |
| `Hero` (split) | 280 | 18 | `auto-fit` |
| `Skeleton.Cards` | 220 | 16 | `auto-fill` |

### 8.4 Topbar

```js
const topbar = {
  width: "100%", boxSizing: "border-box", flexShrink: 0,
  borderBottom: `1px solid ${BORDER}`,
  background: `linear-gradient(180deg, ${SURFACE} 0%, ${BG_TRANSLUCENT} 100%)`,
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
};
const topbarPinned = { position: "sticky", top: 0, zIndex: 120 };
const subBar = { width: "100%", borderTop: `1px solid ${BORDER}`, background: SUBBAR_BG };
const subBarInner = { padding: "6px 18px", display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 12 };
```

### 8.5 Registro de z-index (respetá el orden exacto)

| Capa | z-index |
|---|---|
| Topbar sticky | `120` |
| Sidebar backdrop | `999` |
| Sidebar / BodegaSwitcher | `1000` |
| PinsFlyout | `1001` |
| Botón flotante de chat | `20000` |
| **Sheet (modal)** y **Toast** | `30000` |
| CommandPalette / CircleMenu | `30040` |
| **ConfirmDialog** | `30050` |
| AreasModal / AssistantModal | `31000` |

El orden importa: `ConfirmDialog` y `CommandPalette` deben poder superponerse a
un `Sheet` abierto.

---

## 9. Componentes

### 9.1 Button — 3 variantes × 3 tamaños

```js
const base = {
  borderRadius: 12, cursor: "pointer", fontWeight: 850, whiteSpace: "nowrap",
  fontFamily: "inherit", display: "inline-flex", alignItems: "center",
  justifyContent: "center", border: `1px solid ${BORDER}`,
  transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
};

const sizes = {
  sm: { padding: "7px 11px",  fontSize: 12 },
  md: { padding: "9px 14px",  fontSize: 13 },                    // default
  lg: { padding: "12px 16px", fontSize: 14, borderRadius: 14 },
};

const primary = {
  border: `1px solid ${ACCENT_BORDER}`, background: ACCENT, color: "#fff",
  boxShadow: "0 8px 22px rgba(8,159,138,0.20)",
};
const secondary = { background: SURFACE_INSET, color: TEXT, fontWeight: 950 };
const ghost     = { background: SURFACE, color: TEXT, fontWeight: 800, boxShadow: SHADOW_BTN };

const disabledStyle = { opacity: 0.6, cursor: "not-allowed" };
const inlineIcon    = { display: "inline-flex", alignItems: "center", gap: 8 };
```

API: `variant` (`primary` | `secondary` | `ghost`), `icon` (componente lucide),
`iconRight`, `size`, `block` (→ `width:100%`), `loading`, `disabled`.
Con `loading`, el icono se reemplaza por `Loader2` con
`animation: "spin 0.9s linear infinite"` y el botón queda deshabilitado.
Icono a 16 px, `strokeWidth 2.2`.

Se exportan además `PrimaryButton`, `SecondaryButton`, `GhostButton` como
atajos del mismo componente con la variante fija.

### 9.2 Card — superficie base

```js
const base = {
  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: RADIUS_XL, // 18
  overflow: "hidden", boxShadow: SHADOW_CARD,
  transition: "transform 120ms ease, box-shadow 120ms ease",
};
const accent = {                                   // tone="accent"
  borderColor: "rgba(8,159,138,0.35)",
  boxShadow: "0 12px 26px rgba(8, 159, 138, 0.10)",
};
const hoverStyle = { transform: "translateY(-2px)", boxShadow: SHADOW_CARD_HOVER };
```

`hoverable` o un `onClick` activan el hover **y también en focus** (`onFocus`/
`onBlur` disparan el mismo estado). Con `onClick` agrega `role="button"`,
`tabIndex={0}`, `cursor:pointer`, `userSelect:none` y teclas Enter/Espacio.

### 9.3 ModuleCard — tile de módulo (compuesto sobre Card)

Dos cabeceras posibles.

**Con imagen** — banner de 124 px:
```js
const mediaHeader  = { height: 124, backgroundPosition: "center", position: "relative" };
const mediaOverlay = { position: "absolute", inset: 0,
  background: "linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.55) 100%)" };
const mediaTop = { position: "absolute", top: 12, left: 12, right: 12,
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const pillOnImg = { padding: "6px 10px", borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.14)",
  color: "#fff", fontWeight: 950, fontSize: 11, backdropFilter: "blur(6px)" };
```
`imageFit` acepta `"cover"` (default) o `"contain"`.

**Sin imagen** — cabecera con `IconBox`:
```js
const simpleHeader = { padding: 14, borderBottom: `1px solid ${BORDER_SOFT}`,
  background: `linear-gradient(180deg, ${SURFACE_SOFT} 0%, ${SURFACE} 100%)`,
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
```

**Cuerpo y pie:**
```js
const cardBody   = { padding: 16 };
const cardTitle  = { fontWeight: 950, fontSize: 16, color: TEXT, marginBottom: 6 };
const cardDesc   = { color: SLATE, fontWeight: 650, fontSize: 13,
                     lineHeight: 1.45, minHeight: 40 };   // minHeight iguala alturas en la grilla
const cardFooter = { marginTop: 12, display: "flex", justifyContent: "space-between",
                     alignItems: "center", gap: 10 };
const link       = { color: TEXT, fontWeight: 850, fontSize: 13, display: "inline-flex",
                     alignItems: "center" };              // CTA + <ArrowRight size={14} strokeWidth={2.5}/>
```

Botón de pin (30×30, radio 8): inactivo `color: MUTED` sobre `SURFACE`; activo
`background: ACCENT_SOFT`, `borderColor: rgba(8,159,138,0.3)`, `color: ACCENT`, y
el icono rota `-45deg`.

### 9.4 KpiCard + KpiGrid

```js
const card = {
  background: "linear-gradient(180deg, var(--c-surface, #FFFFFF) 0%, var(--c-surface-soft, #FCFDFE) 100%)",
  border: `1px solid ${BORDER}`, borderRadius: 22, padding: 16,
  boxShadow: "0 10px 22px rgba(15, 23, 42, 0.05)",
  minHeight: 124, display: "grid", alignContent: "start", gap: 8,
};
const cardAccent = { border: "1px solid rgba(8,159,138,0.35)",
                     boxShadow: "0 10px 22px rgba(8,159,138,0.10)" };
const labelStyle = { color: SLATE, fontWeight: 900, fontSize: 12,
                     textTransform: "uppercase", letterSpacing: 0.4 };
const valueStyle = { fontWeight: 950, fontSize: 26, color: TEXT, lineHeight: 1.1 };
const hintStyle  = { color: SLATE, fontWeight: 800, fontSize: 12 };
const iconWrap   = { width: 28, height: 28, borderRadius: 10,
                     background: "var(--c-surface-inset, #F1F5F9)",
                     border: `1px solid ${BORDER}`, display: "grid", placeItems: "center" };
```
Icono a 16 px, color `ACCENT` si `accent`, si no `SLATE`.

### 9.5 RowCard — fila de lista

```js
const rowCard = {
  backgroundColor: "var(--c-surface, #ffffff)", borderRadius: 16, padding: 14,
  border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10,
  minHeight: 92, boxShadow: SHADOW_CARD, userSelect: "none",
  transition: "transform 120ms ease, box-shadow 120ms ease",
};
const rowTitle = { color: TEXT, fontSize: 15, fontWeight: 980,
                   overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
const rowDesc  = { color: SLATE, marginTop: 4, fontSize: 12, fontWeight: 850 };
const rowMeta  = { color: MUTED, marginTop: 6, fontSize: 12, fontWeight: 850 };
```
Slots: `title`, `desc`, `meta`, `extra` (columna derecha, `alignItems:flex-end`), `right`.

### 9.6 IconBox

```js
const base = { borderRadius: 14, display: "grid", placeItems: "center",
               background: SURFACE_INSET, border: `1px solid ${BORDER}` };
const accentStyle = { background: ACCENT_SOFT, border: "1px solid rgba(8,159,138,0.25)" };
```
Default 48×48 con icono de 22 px; color `ACCENT` en tono accent, `SLATE` en neutral.

### 9.7 Badge — pill informativo

```js
const base = { fontSize: 12, fontWeight: 800, padding: "5px 11px", borderRadius: 999,
               display: "inline-flex", alignItems: "center" };
const neutralTone = { background: "#fff", border: `1px solid ${BORDER}`, color: "#334155" };
const accentTone  = { background: ACCENT_SOFT, border: "1px solid rgba(8,159,138,0.30)", color: ACCENT };
const darkTone    = { background: "#0F172A", border: "1px solid #0F172A", color: "#fff" };
```
Icono opcional a 12 px, `strokeWidth 2.5`, `marginRight: 5`.

### 9.8 StatusPill — estado semántico

```js
const base = { padding: "6px 10px", borderRadius: 999, border: `1px solid ${BORDER}`,
               fontWeight: 800, fontSize: 11, display: "inline-flex",
               alignItems: "center", whiteSpace: "nowrap" };

const tones = {
  neutral: { background: "#F2F4FB", color: "#334155" },
  ok:      { background: OK_BG,     borderColor: OK_BORDER,     color: "#1B7A3A" },
  warn:    { background: WARN_BG,   borderColor: WARN_BORDER,   color: "#8C5A00" },
  danger:  { background: DANGER_BG, borderColor: DANGER_BORDER, color: DANGER },
  accent:  { background: ACCENT_SOFT, borderColor: "rgba(8,159,138,0.30)", color: ACCENT },
  dark:    { background: "#0F172A", borderColor: "#0F172A", color: "#fff" },
};
```
`ok`/`warn`/`danger` renderizan icono por defecto (`CheckCircle2`,
`AlertTriangle`, `XCircle`) a 12 px con `marginRight: 4` y `flexShrink: 0`.
`icon={null}` lo suprime. Lleva `role="status"`.

### 9.9 Chip + ChipsRow — filtro toggleable

```js
const row    = { display: "flex", flexWrap: "wrap", gap: 8 };
const chip   = { borderRadius: 999, border: `1px solid ${BORDER}`, background: "#fff",
                 padding: "8px 12px", cursor: "pointer", boxShadow: SHADOW_SOFT,
                 fontFamily: "inherit" };
const chipOn = { background: "#0F172A", borderColor: "#0F172A" };   // activo = casi negro
const txt    = { fontWeight: 950, fontSize: 12, color: TEXT };
const txtOn  = { color: "#fff" };
```
Nótese: el chip activo es **oscuro**, no verde. El verde queda reservado al
acento primario.

### 9.10 Field — label + control + validación

```js
const wrap       = { display: "grid", gap: 6 };
const labelStyle = { color: SLATE, fontWeight: 950, fontSize: 12 };
const req        = { color: DANGER, fontWeight: 950 };              // asterisco de requerido

const inputStyle = {
  borderRadius: 14, border: `1px solid ${BORDER}`,
  background: "var(--c-surface-soft, #FBFCFF)",
  padding: "12px 12px", outline: "none", fontWeight: 850, color: TEXT,
  fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};
const invalidStyle = { borderColor: DANGER_BORDER, background: "#FEF6F6",
                       boxShadow: "0 0 0 3px rgba(185,28,28,0.10)" };
const textareaStyle = { minHeight: 96, resize: "vertical" };
const hintStyle  = { color: SLATE, fontWeight: 700, fontSize: 12 };
const errorStyle = { color: DANGER, fontWeight: 800, fontSize: 12 };
```

Detalle clave de arquitectura: `Field` propaga `invalid` por **React context**,
así que `Field.Input` / `Field.Select` / `Field.Textarea` toman solos el borde
rojo y `aria-invalid` cuando el `Field` padre tiene `error`. No hay que cablear
nada en el control. El mensaje de error va con `role="alert"` y reemplaza al hint.

### 9.11 SearchInput

```js
const row = { backgroundColor: "var(--c-surface, #ffffff)", borderRadius: 14,
              border: `1px solid ${BORDER}`, padding: "10px 10px",
              display: "flex", alignItems: "center", gap: 8, boxShadow: SHADOW_SOFT };
const icon  = { width: 22, display: "grid", placeItems: "center", color: MUTED };
const input = { flex: 1, border: "none", outline: "none", fontWeight: 850,
                color: TEXT, background: "transparent", minWidth: 0 };
const clearBtn = { width: 30, height: 30, borderRadius: 10, border: `1px solid ${BORDER}`,
                   background: "var(--c-surface, #fff)", cursor: "pointer",
                   color: "#64748B", display: "grid", placeItems: "center" };
```
Icono `Search` a 16 px a la izquierda; botón de limpiar (`X` 14 px) solo si hay valor.

### 9.12 Sheet — modal / bottom-sheet

Se renderiza con `createPortal` a `document.body` para que `position: fixed` sea
relativo al viewport y no a un ancestro con `transform`/`overflow`.

```js
const root       = { position: "fixed", inset: 0, zIndex: 30000 };
const rootBottom = { display: "grid", placeItems: "end center" };   // placement="bottom" (default)
const rootCenter = { display: "grid", placeItems: "center" };       // placement="center"

const backdrop = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)",
                   border: "none", cursor: "pointer" };

const sheetBase = {
  position: "relative", width: "100%", background: "var(--c-surface, #fff)",
  border: `1px solid ${BORDER}`, padding: 16, margin: 12, boxSizing: "border-box",
  display: "flex", flexDirection: "column",
  maxHeight: "calc(100vh - 24px)", overflow: "hidden",
};
const sheetBottom = { borderTopLeftRadius: 22, borderTopRightRadius: 22,
                      boxShadow: "0 -18px 60px rgba(15,23,42,0.22)" };
const sheetCenter = { borderRadius: 22, boxShadow: "0 24px 60px rgba(15,23,42,0.28)" };
const sheetMobile = { margin: 0, padding: 14, maxWidth: "100%", maxHeight: "100dvh",
                      borderRadius: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18 };

const body    = { display: "grid", gap: 12, flex: "1 1 auto", minHeight: 0,
                  overflowY: "auto", paddingRight: 2 };
const actions = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
                  marginTop: 12, flexShrink: 0 };
const titleStyle = { fontSize: 16, fontWeight: 980, color: TEXT };
const closeBtn = { padding: "8px 12px", borderRadius: 999, border: `1px solid ${BORDER}`,
                   backgroundColor: "var(--c-surface-inset, #F2F4FB)", cursor: "pointer",
                   fontWeight: 950, color: TEXT, fontFamily: "inherit" };
```

`maxWidth` por defecto 720. Breakpoint móvil del Sheet: **560 px**. Header y
footer quedan fijos (`flexShrink: 0`) y solo el body scrollea.
Subcomponentes: `Sheet.Body`, `Sheet.Actions`, `Sheet.Hint`.

### 9.13 EmptyState

```js
const wrap = { padding: 16, borderRadius: 16, border: `1px solid ${BORDER}`,
               backgroundColor: "var(--c-surface-soft, #FBFCFF)", boxShadow: SHADOW_CARD,
               display: "grid", gap: 6, justifyItems: "start" };
const centerWrap = { padding: "32px 20px", justifyItems: "center", textAlign: "center" };
const iconBox = { width: 44, height: 44, borderRadius: 14,
                  background: "var(--c-surface-inset, #F1F5F9)",
                  border: `1px solid ${BORDER}`, display: "grid",
                  placeItems: "center", marginBottom: 4 };
const titleStyle = { color: TEXT, fontWeight: 980, fontSize: 14 };
const text = { color: SLATE, fontWeight: 850, fontSize: 13, lineHeight: 1.35 };
```
Icono a 22 px color `SLATE`. Slot `action` con `marginTop: 12`. Con `center`, la
descripción se limita a `maxWidth: 380`.

### 9.13b ErrorState

A diferencia de `EmptyState`, va **teñido de rojo completo** (fondo `DANGER_BG`),
no neutro. Siempre centrado y con `role="alert"`.

```js
const wrap = { padding: "28px 20px", borderRadius: 16,
               border: `1px solid ${DANGER_BORDER}`, background: DANGER_BG,
               boxShadow: SHADOW_CARD, display: "grid", justifyItems: "center",
               textAlign: "center", gap: 8 };
const iconBox = { width: 52, height: 52, borderRadius: 16,
                  background: "var(--c-surface, #fff)",
                  border: `1px solid ${DANGER_BORDER}`, display: "grid",
                  placeItems: "center", marginBottom: 2 };
const titleStyle = { color: TEXT, fontWeight: 900, fontSize: 15, lineHeight: 1.25 };
const text = { color: SLATE, fontWeight: 700, fontSize: 13, lineHeight: 1.45,
               maxWidth: 420, wordBreak: "break-word" };
const retryBtn = { marginTop: 8, display: "inline-flex", alignItems: "center", gap: 7,
                   padding: "9px 16px", borderRadius: 12, border: `1px solid ${BORDER}`,
                   background: "var(--c-surface, #fff)", color: TEXT,
                   fontWeight: 850, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
```
Título por defecto `"No se pudo cargar la información"`; icono `AlertTriangle`
22 px color `DANGER`; botón de reintento con `RefreshCw` 15 px,
`retryLabel` por defecto `"Reintentar"`.

### 9.14 Skeleton — placeholder con shimmer

**Preferilo por sobre el spinner** en listas y cards: preserva el layout y se
percibe más rápido.

```js
// Barra simple — defaults: width "100%", height 16, radius 8
const bar = {
  display: "block", width, height, borderRadius: radius,
  background: "linear-gradient(90deg, #EEF1F6 25%, #F6F8FB 37%, #EEF1F6 63%)",
  backgroundSize: "400% 100%",
  animation: "appoloShimmer 1.3s ease-in-out infinite",
};
```

- `<Skeleton.List rows={4} height={56} gap={10} />` → grid vertical, radio `RADIUS_MD` (12).
- `<Skeleton.Cards count={6} minWidth={220} height={150} />` → grid `auto-fill`,
  gap 16, radio 16.
- Contenedores con `aria-busy="true"` y `aria-label="Cargando"`; la barra lleva
  `aria-hidden="true"`.

⚠️ El gradiente está **hardcodeado en tonos claros** (`#EEF1F6` / `#F6F8FB`): el
skeleton no es theme-aware y se ve mal en modo oscuro. Si la app destino usa
tema oscuro, cambiá esos dos hex por
`var(--c-surface-inset)` / `var(--c-surface-soft)`.

### 9.15 Spinner

```js
const spinnerBase = {
  display: "inline-block", borderRadius: 999,
  border: "3px solid rgba(15,23,42,0.12)", borderTopColor: ACCENT,
  animation: "spin 0.9s linear infinite",
};
const center = { minHeight: 200, display: "grid", placeItems: "center", gap: 10 };
const loadingText = { color: SLATE, fontWeight: 850 };
```
Tamaño default 30 px; el grosor se calcula `Math.max(2, Math.round(size / 10))`.
`inline` devuelve solo el círculo, sin el contenedor centrado de 200 px.

### 9.16 Toast

Provider global + hook: `toast.success/error/warning/info(mensaje)` o
`toast.show({ type, title, message, duration })`. Los errores duran 6000 ms por
defecto; el resto usa la duración estándar. Hover pausa el auto-cierre.

```js
const viewport = { position: "fixed", top: "max(16px, env(safe-area-inset-top))",
                   right: 16, left: "auto", zIndex: 30000, display: "flex",
                   flexDirection: "column", gap: 10,
                   width: "min(390px, calc(100vw - 24px))", pointerEvents: "none" };
const itemStyle = { pointerEvents: "auto", display: "flex", alignItems: "flex-start",
                    gap: 12, padding: "12px 12px 12px 14px", borderRadius: 14,
                    border: `1px solid ${BORDER}`, background: "var(--c-surface, #fff)",
                    boxShadow: "0 14px 36px rgba(15,23,42,0.16)" };
const titleStyle = { fontWeight: 900, fontSize: 13.5, color: TEXT, lineHeight: 1.25 };
```

Tonos: `success` → `OK_BG`/`OK_BORDER`/acento `#1B7A3A` + `CheckCircle2`;
`error` → `DANGER_BG`/`DANGER_BORDER`/`DANGER` + `XCircle`;
`warning` → `WARN_BG`/`WARN_BORDER` + `AlertTriangle`; `info` + `Info`.
Entrada `appoloToastIn 220ms cubic-bezier(0.22,1,0.36,1)`, salida
`appoloToastOut 180ms ease forwards`.

**Regla del proyecto:** nunca `alert()` / `confirm()` nativos. Usá
`useToast()` y `useConfirm()`.

### 9.17 TableScroll

```js
const outer = { position: "relative", width: "100%", borderRadius: RADIUS_LG, overflow: "hidden" };
const borderedOuter = { border: `1px solid ${BORDER}`, background: "var(--c-surface, #fff)" };
const scroller = { width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" };
```
Envolvé cualquier tabla ancha. `minWidth` (default 640) es el ancho mínimo antes
de scrollear. El scroller lleva `role="region"` y `tabIndex={0}` para que sea
alcanzable por teclado.

### 9.18 Hero y SectionTitle

```js
const hero = { display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: 18, alignItems: "start" };
const heroCompact = { display: "flex", alignItems: "center", justifyContent: "space-between",
  gap: 16, flexWrap: "wrap", paddingTop: 8, paddingBottom: 4 };

const kickerDot  = { width: 8, height: 8, borderRadius: 999, background: ACCENT,
                     boxShadow: "0 0 0 3px rgba(8,159,138,0.2)" };
const kickerText = { fontSize: 11, fontWeight: 900, letterSpacing: 0.08,
                     textTransform: "uppercase", color: ACCENT };
const titleStyle = { margin: 0, fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 950,
                     letterSpacing: -0.4, lineHeight: 1.12, color: TEXT };
const subtitleStyle = { margin: 0, color: SLATE, fontWeight: 650, lineHeight: 1.5,
                        fontSize: 14, maxWidth: 560 };

const sectionHeader  = { display: "flex", alignItems: "center", justifyContent: "space-between",
                         gap: 12, flexWrap: "wrap", marginTop: 8, marginBottom: 6 };
const sectionTitleTxt = { fontWeight: 980, fontSize: 16, color: TEXT };
const sectionHint     = { color: SLATE, fontWeight: 800, fontSize: 13, lineHeight: 1.35 };
```

El "kicker" (puntito verde con halo + texto en mayúsculas) es un elemento de
identidad del sistema: usalo en las cabeceras de página.

---

## 10. Anatomía de una página

```jsx
<Shell>
  <Topbar />
  <Main>
    <Container style={{ maxWidth: CONTAINER_MAX }}>
      <Hero kicker="Centro de control" title="Módulos"
            subtitle="Seleccioná el flujo que necesitás."
            badge={<Badge tone="accent" icon={Package}>Operación</Badge>} />

      <KpiGrid>
        <KpiCard label="Acciones" value={42} hint="Última semana" icon={BarChart3} />
      </KpiGrid>

      <SectionTitle title="Operación" hint="6 módulos"
                    action={<GhostButton icon={Filter}>Filtrar</GhostButton>} />

      {loading ? <Skeleton.Cards count={6} />
       : error ? <ErrorState description={error.message} onRetry={refetch} />
       : rows.length === 0 ? <EmptyState icon={Package} title="Sin resultados"
             description="Ajustá los filtros."
             action={<PrimaryButton onClick={create}>Nueva acción</PrimaryButton>} />
       : <ModuleGrid>{rows.map(r => <ModuleCard key={r.id} {...r} />)}</ModuleGrid>}
    </Container>
  </Main>
</Shell>
```

**Orden canónico de estados, siempre el mismo:**
`loading` → `error` → `empty` → `data`.

---

## 11. Barrel de importación

Un único punto de entrada:

```js
import {
  Shell, Topbar, Brand, Main, Container, Hero, SectionTitle,
  Card, ModuleCard, ModuleGrid, KpiCard, KpiGrid, RowCard, QuickCard, IconBox,
  Badge, StatusPill, Chip, ChipsRow,
  Button, PrimaryButton, SecondaryButton, GhostButton,
  SearchInput, Field, TableScroll, Sheet,
  EmptyState, ErrorState, Skeleton, Spinner,
  ToastProvider, useToast, ConfirmProvider, useConfirm,
  Breadcrumbs, ThemeToggle,
} from "@/components/ui";

import { ACCENT, BORDER, SLATE, TEXT, CONTAINER_MAX, withAlpha } from "@/styles/theme";
```

---

## 12. Inconsistencias conocidas del código fuente

Son reales y están en el original. Al portar, **corregilas** en vez de copiarlas:

1. **Hex hardcodeados que rompen el modo oscuro.** Varios componentes escriben
   `background: "#fff"` o `"#0F172A"` en lugar del token: `Badge` (neutral y
   dark), `Chip` (fondo y estado activo), `StatusPill` (neutral y dark).
   En modo oscuro quedan como parches blancos. Reemplazá por `SURFACE` /
   `SURFACE_INSET` / `TEXT`.
2. **`Skeleton` no es theme-aware** (ver §9.14).
3. **Pila de fuentes divergente:** el sistema usa `Arial, sans-serif`, pero
   `Toast` y `ErrorState` declaran
   `"system-ui, -apple-system, Segoe UI, Roboto, Arial"`. Unificá en `FONT_STACK`.
4. **La escala de pesos nombrada llega a 800**, pero los componentes usan 850,
   900, 950 y 980 como literales. O ampliás la escala con esos valores o asumís
   los literales; no mezcles criterios.
5. **`Container` no aplica `CONTAINER_MAX`** por defecto (ver §8.2).
6. **`ModuleCard` tiene constantes muertas**: `statusOnImg`, `statusOnImgOk`,
   `statusPillSolid`, `statusOkSolid` son objetos vacíos sin uso. No los portes.
7. **El default de `<button>` de Vite sigue en `index.css`** (ver §7). Es la
   trampa más peligrosa al integrar en una app existente.

---

## 13. Checklist de aceptación

- [ ] `theme.js` con todos los tokens; cero hex sueltos fuera de ese archivo.
- [ ] Variables CSS claras + bloque `:root[data-theme="dark"]`.
- [ ] El acento verde `#089F8A` es idéntico en ambos modos.
- [ ] Toda grilla usa `repeat(auto-fit, minmax(min(100%, Xpx), 1fr))`.
- [ ] Toda superficie clickeable hace `translateY(-2px)` + sombra al hover **y al focus**.
- [ ] Radios de 12–22 px; pills en 999.
- [ ] Pesos tipográficos en 650–980; ninguno en 400/500 salvo el reset.
- [ ] Iconos lucide a `strokeWidth 2.2`.
- [ ] `:focus-visible` con anillo verde de 2 px y offset 2 px.
- [ ] `prefers-reduced-motion` respetado.
- [ ] z-index conforme a la tabla de §8.5.
- [ ] Los cuatro estados (loading/error/empty/data) resueltos en cada vista.
- [ ] Sin `alert()` ni `confirm()` nativos.
