# Implementation Plan: Despachos Dev

## Overview

El plan implementa la página de solo lectura "Despachos Dev" siguiendo el diseño: primero la capa de dominio pura (testeable por propiedades), luego los hooks de datos/realtime, después el enhancement accesible del `Sheet` y la exportación, a continuación los componentes de presentación, y finalmente la página contenedora con sus estados de UI y el cableado de ruteo/navegación. Cada paso construye sobre el anterior y termina integrado en la página.

Stack: React 19 + Vite (JavaScript), `@supabase/supabase-js` v2 (clave anónima), UI kit en `src/components/ui/`, tokens en `src/styles/theme.js`. Pruebas de propiedad con Vitest + fast-check (mínimo 100 iteraciones por propiedad).

Convenciones:
- Cada test de propiedad reside en su propio archivo y lleva la etiqueta de comentario `// Feature: despachos-dev, Property {n}: {texto}`.
- Toda consulta aplica filtros de scope (`tenant_id`, `company`, `bodega_id`) derivados de `AuthCtx`, límite de 50 por estado y timeout de 30s.
- Colores/espaciados solo desde `theme.js`; nunca literales embebidos.

## Tasks

- [x] 1. Configurar tooling de pruebas y tokens de tema
  - [x] 1.1 Añadir Vitest + fast-check y configuración de pruebas
    - Añadir `vitest` y `fast-check` como `devDependencies` en `package.json`
    - Crear configuración de Vitest (entorno jsdom para tests de componentes) y script `test` en modo single-run (`vitest run`)
    - Crear archivo de setup para React Testing Library (`@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`)
    - No ejecutar en modo watch dentro de automatizaciones
    - _Requirements: 11.6_

  - [x] 1.2 Añadir tokens de estado a `src/styles/theme.js`
    - Añadir `ESTADO_COLORS` (mapa codigo→hex del Requirement 1.4) y `ESTADO_ICONS` (codigo→nombre de ícono lucide)
    - Añadir `ESTADO_NEUTRO_COLOR = "#9ca3af"`
    - No embeber estos valores fuera del tema
    - _Requirements: 11.4, 11.5_

- [x] 2. Implementar dominio: mapa de estados (`src/pages/Dev/DespachosDev/lib/mapaEstados.js`)
  - [x] 2.1 Implementar `mapaEstados.js`
    - `buildMapaEstados(catalogo)` que expone `get/label/color/isFinal`, tomando `nombre` y `orden` del `Catalogo_Estados` como fuente de verdad
    - `isFinal(codigo)` determinista: `true` solo para `despachado` y `finalizado`
    - `colorFor(codigo)` y `labelFor(codigo, catalogo)`: color/ícono desde tokens del tema; valores neutros (`#9ca3af`, `FileText`, propio código como etiqueta) para códigos desconocidos
    - Helpers `label`, `color`, `isFinal` desde un único módulo reutilizable
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.2 Escribir test de propiedad para estados finales
    - **Property 1: Estados finales deterministas**
    - **Validates: Requirements 1.7**

  - [x] 2.3 Escribir test de propiedad para nombre/orden desde catálogo
    - **Property 2: nombre y orden provienen del catálogo**
    - **Validates: Requirements 1.3**

  - [x] 2.4 Escribir test de propiedad para código desconocido
    - **Property 3: Código desconocido usa valores neutros**
    - **Validates: Requirements 1.5**

- [x] 3. Implementar dominio: formato (`src/pages/Dev/DespachosDev/lib/despachoFormat.js`)
  - [x] 3.1 Implementar `despachoFormat.js`
    - `formatSD(tarimasS, tarimasD)` en formato "S/D" con placeholder por lado no numérico
    - `relativeTime(updatedAt, now)` en español ("hace 5 minutos")
    - `orNoValue(value)` que devuelve guion "—" (texto visible no vacío) para nulo/vacío/solo espacios
    - _Requirements: 3.1, 3.5, 3.6, 5.3, 5.8_

  - [x] 3.2 Escribir test de propiedad para placeholder de ausencia
    - **Property 5: Placeholder de ausencia siempre visible**
    - **Validates: Requirements 3.6, 5.3, 5.8**

  - [x] 3.3 Escribir test de propiedad para formato de tarimas
    - **Property 6: Formato de tarimas "S/D"**
    - **Validates: Requirements 3.1**

  - [x] 3.4 Escribir test de propiedad para tiempo relativo
    - **Property 7: Tiempo relativo consistente**
    - **Validates: Requirements 3.5**

- [x] 4. Implementar dominio: agrupación y orden (`src/pages/Dev/DespachosDev/lib/despachoGrouping.js`)
  - [x] 4.1 Implementar `despachoGrouping.js`
    - `groupByEstado(despachos, catalogo)`: considera solo despachos con `deleted_at` nulo y `estado <> 'eliminado'`; un grupo por código del catálogo con ≥1 despacho; excluye `eliminado`; sin grupos vacíos
    - Orden de grupos: ascendente por `orden`, desempate alfabético ascendente por `nombre`
    - Orden de despachos dentro del grupo: `created_at` descendente, desempate por `id` descendente
    - Orden estable de entradas de historial por `created_at` descendente, desempate por `id` descendente
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.2_

  - [x] 4.2 Escribir test de propiedad para agrupación
    - **Property 8: Agrupación excluye borrados/eliminados y no crea grupos vacíos**
    - **Validates: Requirements 2.1, 2.2, 2.5**

  - [x] 4.3 Escribir test de propiedad para orden de grupos
    - **Property 9: Orden determinista de grupos**
    - **Validates: Requirements 2.3**

  - [x] 4.4 Escribir test de propiedad para orden de despachos
    - **Property 10: Orden determinista de despachos dentro del grupo**
    - **Validates: Requirements 2.4**

  - [x] 4.5 Escribir test de propiedad para orden del historial
    - **Property 11: Orden estable de entradas de historial**
    - **Validates: Requirements 6.2**

- [x] 5. Implementar dominio: filtros (`src/pages/Dev/DespachosDev/lib/despachoFilters.js`)
  - [x] 5.1 Implementar `despachoFilters.js`
    - `filterDespachos(despachos, { texto, estados, desde, hasta })` como conjunción (AND) de los filtros
    - Texto: coincidencia parcial insensible a mayúsculas sobre `referencia`, `tienda`, `placa`
    - Estados: vacío ⇒ todos; en otro caso `estado ∈ estados`
    - Fechas: `fecha` dentro de `[desde, hasta]` inclusive
    - `isValidDateRange(desde, hasta)`: `false` si ambas existen y `desde > hasta`
    - `clearFilters()` y derivación del contador de visibles; conteos por estado del mini-resumen
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 5.2 Escribir test de propiedad para búsqueda de texto
    - **Property 12: Búsqueda de texto parcial e insensible a mayúsculas**
    - **Validates: Requirements 4.1**

  - [x] 5.3 Escribir test de propiedad para filtro de estado múltiple
    - **Property 13: Filtro de estado múltiple**
    - **Validates: Requirements 4.2**

  - [x] 5.4 Escribir test de propiedad para rango de fechas inclusivo
    - **Property 14: Rango de fechas inclusivo**
    - **Validates: Requirements 4.3**

  - [x] 5.5 Escribir test de propiedad para validación de rango de fechas
    - **Property 15: Validación de rango de fechas**
    - **Validates: Requirements 4.4**

  - [x] 5.6 Escribir test de propiedad para combinación de filtros
    - **Property 16: Combinación acumulativa de filtros (AND)**
    - **Validates: Requirements 4.5**

  - [x] 5.7 Escribir test de propiedad para contador de visibles
    - **Property 17: Contador consistente con el resultado filtrado**
    - **Validates: Requirements 4.7, 4.8**

  - [x] 5.8 Escribir test de propiedad para conteos del mini-resumen
    - **Property 18: Conteos por estado del mini-resumen**
    - **Validates: Requirements 4.9**

- [x] 6. Implementar dominio: historial (`src/pages/Dev/DespachosDev/lib/historialDetalle.js`)
  - [x] 6.1 Implementar `historialDetalle.js`
    - `parseTransicion(detalle)`: devuelve `{ estadoAnterior, estadoNuevo }` solo cuando ambos existen y son no vacíos; en otro caso `null`
    - _Requirements: 6.5, 6.6_

  - [x] 6.2 Escribir test de propiedad para detección de transición
    - **Property 19: Detección de transición en el historial**
    - **Validates: Requirements 6.5, 6.6**

- [x] 7. Implementar dominio: scope y reductor realtime (`src/pages/Dev/DespachosDev/lib/`)
  - [x] 7.1 Implementar reductor realtime puro y helper de filtrado de scope
    - Función pura del reductor realtime que aplica insert/update/delete solo sobre el despacho afectado por `id` cuando está en scope, e ignora eventos fuera de scope
    - Helper de filtrado por scope completo que reutiliza `isInUserScope` de `src/utils/dataScope.js` para exigir coincidencia de `tenant_id`, `company` y `bodega_id`
    - _Requirements: 7.2, 7.3, 9.1_

  - [x] 7.2 Escribir test de propiedad para el reductor realtime
    - **Property 20: Reductor realtime respeta el scope**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 7.3 Escribir test de propiedad para filtrado por scope completo
    - **Property 21: Filtrado por scope completo (tenant + company + bodega)**
    - **Validates: Requirements 9.1**

- [x] 8. Checkpoint - Asegurar que las pruebas de dominio pasan
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implementar hooks de datos y realtime (`src/pages/Dev/DespachosDev/hooks/`)
  - [x] 9.1 Implementar `useDespachosDevData.js`
    - Cargar `Catalogo_Estados` (límite 5s) y construir `mapaEstados`
    - Consultar listado por estado con filtros de scope explícitos, `deleted_at IS NULL`, `estado <> 'eliminado'`, orden `created_at desc`, límite 50 por estado con paginación, estructurados para el índice compuesto
    - Suscripción realtime al listado con filtro de scope, reconciliación vía reductor puro, filtrado defensivo en cliente, indicador de degradación, reintento cada 15s y limpieza de canales en unmount (deps completas)
    - Timeout de 30s por consulta; exponer `{ catalogo, despachos, mapaEstados, loading, error, realtimeStatus, reload }`
    - _Requirements: 1.1, 1.2, 2.1, 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 9.5, 9.6, 9.7_

  - [x] 9.2 Implementar `useDespachoDetail.js`
    - Cargar datos del despacho, resolver chofer vía `despacho_dev_choferes` (con `choferError` no bloqueante) y cargar historial filtrando por `entidad='despacho'` y `entidad_id`
    - Suscripción realtime del historial para el despacho activo y limpieza al cerrar/desmontar
    - Timeout de 30s; exponer `{ despacho, chofer, choferError, historial, loading, error, realtimeStatus, reload }`
    - _Requirements: 5.6, 5.7, 5.10, 6.1, 6.8, 7.4, 7.5_

  - [x] 9.3 Escribir pruebas de integración de realtime con cliente Supabase simulado
    - Apertura/cierre de canales, degradación y reintento, forma de las consultas (scope, orden, límite 50, paginación)
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 7.7, 9.5, 9.6_

- [x] 10. Enhancement accesible del `Sheet` y exportación
  - [x] 10.1 Enhancement retrocompatible de `src/components/ui/Sheet.jsx`
    - Mover el foco al primer elemento interactivo al abrir
    - Confinar `Tab`/`Shift+Tab` dentro del contenedor mientras esté abierto
    - Restaurar el foco al elemento disparador al cerrar (incluye cierre por Escape)
    - Exponer `role="dialog"` con `aria-modal="true"` y mantener indicador de foco visible
    - Cambios aditivos y seguros por defecto para no romper otros consumidores
    - _Requirements: 11.2, 11.3_

  - [x] 10.2 Implementar `exportDespacho.js` con carga perezosa
    - Exportación opcional de datos de negocio e historial usando `jspdf`/`exceljs` importados de forma perezosa
    - Manejo de error de exportación sin cerrar ni alterar el detalle
    - _Requirements: 5.11, 5.12_

  - [x] 10.3 Escribir pruebas de accesibilidad del `Sheet`
    - Verificar `role="dialog"`, `aria-modal="true"`, foco inicial, confinamiento de `Tab` y retorno de foco tras Escape
    - _Requirements: 11.2, 11.3_

- [x] 11. Implementar componentes de presentación (`src/pages/Dev/DespachosDev/components/`)
  - [x] 11.1 Implementar `EstadoBadge.jsx`
    - Especialización delgada de `Badge` que compone color + texto legible no vacío usando `mapaEstados` y tokens del tema
    - Color neutro y texto del código para estados desconocidos; nunca comunica el estado solo por color
    - _Requirements: 3.2, 3.3, 5.4, 11.1_

  - [x] 11.2 Escribir test de propiedad para la insignia de estado
    - **Property 4: Insignia de estado comunica con texto y color**
    - **Validates: Requirements 3.2, 3.3, 5.4, 11.1**

  - [x] 11.3 Implementar `DespachoCard.jsx`
    - Reutilizar `Card` (hoverable, `onClick` para abrir detalle)
    - Mostrar `referencia`, `tienda`, `fecha`, tarimas "S/D", `EstadoBadge`, nombre del chofer (si `chofer_id`) y `updated_at` como tiempo relativo; usar `orNoValue`/`formatSD` para ausencias
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 11.4 Implementar `HistorialTimeline.jsx`
    - Línea de tiempo vertical con `descripcion`, `actor_email` y `created_at` (fecha y hora a minutos), orden `created_at` desc estable
    - Transición coloreada solo cuando `parseTransicion` devuelve ambos estados; estado vacío y estado de error propios sin cerrar el detalle
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 11.5 Implementar `RealtimeIndicator.jsx`
    - Indicador no bloqueante que informa cuando la actualización automática está inactiva y se retira al reconectar
    - _Requirements: 7.6, 7.7_

  - [x] 11.6 Implementar `FiltersBar.jsx`
    - Reutilizar `SearchInput`; selector de estados múltiple, dos inputs de fecha con validación de rango (error inline), botón "Limpiar filtros" y contador de visibles
    - Mini-resumen por estado con `recharts` (carga perezosa) cuando esté disponible y habilitado
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 4.9_

  - [x] 11.7 Implementar `KanbanBoard.jsx`
    - Tablero con una columna por estado (viewport ≥ 1024px) en el orden de grupos definido
    - Renderiza `DespachoCard` por despacho
    - _Requirements: 2.6_

  - [x] 11.8 Implementar `AccordionGroups.jsx`
    - Acordeón/pestañas con una sección por estado (viewport < 1024px) en el orden de grupos definido
    - Renderiza `DespachoCard` por despacho
    - _Requirements: 2.7_

  - [x] 11.9 Implementar `DespachoDetailSheet.jsx`
    - Envolver `Sheet` mejorado; mostrar campos de negocio (guion "—" para vacíos), `EstadoBadge` del estado actual, `estado_motivo` si existe, datos del chofer (o indicador de no disponible), marcas de tiempo y `HistorialTimeline`
    - Solo lectura (sin controles de cambio/edición); exportación opcional vía `exportDespacho`; apertura ≤ 2s
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12_

  - [x] 11.10 Escribir pruebas unitarias/de componentes
    - Cubrir tarjeta (3.4), filtros (4.6, 4.8), detalle (5.1, 5.2, 5.5, 5.6, 5.7, 5.9), historial (6.3, 6.4, 6.7, 6.8) con RTL y mocks del cliente Supabase
    - _Requirements: 3.4, 4.6, 4.8, 5.1, 5.2, 5.5, 5.9, 6.3, 6.4, 6.7_

- [x] 12. Checkpoint - Asegurar que las pruebas pasan
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implementar la página contenedora y estados de UI
  - [x] 13.1 Implementar `DespachosDevPage.jsx`
    - Orquestar hooks de datos y detalle; conmutar kanban/acordeón con `useIsMobile(1023)` (transición < 500ms sin recargar)
    - Estados de UI: `Skeleton` de carga (≤200ms), contenido en éxito, `ErrorState` con reintento preservando filtros, `EmptyState` (0 activos), mensaje de "sin resultados" distinto del vacío, y mensaje sin-permiso/sin-scope sin detalles técnicos
    - Cablear `FiltersBar`, `KanbanBoard`/`AccordionGroups`, `DespachoDetailSheet` y `RealtimeIndicator`; no usar service role
    - _Requirements: 2.8, 2.9, 2.10, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.3, 9.4_

  - [x] 13.2 Escribir pruebas unitarias de estados de UI
    - Cubrir carga, error+reintento, vacío, sin-resultados y sin-permiso
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 14. Cablear ruteo y navegación
  - [x] 14.1 Registrar la ruta y la entrada de módulo
    - Declarar la ruta `/dev/despachos-dev` en `src/App.jsx` dentro de `PrivateRoute`
    - Añadir la entrada de módulo en `src/config/workAreas.jsx` para el área `dev` (verificar que `src/config/routeAccess.js` ya cubre `/dev` con rol `dev`)
    - _Requirements: 9.1, 9.2_

- [x] 15. Checkpoint final - Asegurar que lint y build pasan
  - Ejecutar `npm run lint` (cero errores/advertencias) y `npm run build`; ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Los tests de propiedad validan las propiedades universales de la capa de dominio pura (Vitest + fast-check, ≥100 iteraciones); las pruebas de ejemplo/integración cubren UI, infraestructura y accesibilidad.
- Los checkpoints aseguran validación incremental.
- La página es estrictamente de solo lectura y no debe usar la clave de servicio en el frontend.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "10.1", "10.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "4.5", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "6.2", "7.2", "7.3", "10.3", "11.1"] },
    { "id": 3, "tasks": ["9.1", "9.2", "11.2", "11.3", "11.4", "11.5", "11.6"] },
    { "id": 4, "tasks": ["9.3", "11.7", "11.8", "11.9"] },
    { "id": 5, "tasks": ["11.10", "13.1"] },
    { "id": 6, "tasks": ["13.2", "14.1"] }
  ]
}
```
