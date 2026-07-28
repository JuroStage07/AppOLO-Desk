# Requirements Document

## Introduction

Esta especificación describe una nueva página administrativa de solo lectura, "Despachos Dev", dentro de AppoloDesk (SPA React 19). La página consume exclusivamente datos del módulo "Despacho Dev" almacenados en el proyecto Supabase compartido con la app móvil OLOso. NO utiliza Firebase para sus datos de negocio.

El objetivo es que un usuario administrativo pueda:

1. Ver un listado de despachos agrupado por estado (tablero tipo kanban en escritorio, acordeón/pestañas en móvil).
2. Abrir un detalle de solo lectura con los datos de negocio, el estado actual y los datos del chofer.
3. Consultar el historial de cambios (bitácora inmutable) de cada despacho como una línea de tiempo.

La página es estrictamente de solo lectura: no cambia estados, no edita despachos y no ejecuta mutaciones salvo que se solicite explícitamente en una especificación futura.

**Decisión de alcance (resuelta):** Se implementa el modelo de alcance único (Opción A). El usuario administrativo inicia sesión con sus claims de scope (`tenant_id`/`company`/`bodega_id`) y ve únicamente los despachos de SU bodega, igual que la app móvil. No se modifican políticas RLS. La vista multi-tenant/multi-bodega (Opción B) queda documentada como pregunta abierta y extensión futura (ver Requirement 10). El código debe dejar `tenant_id`/`company`/`bodega_id` preparados como filtros/props opcionales para habilitar (B) más adelante sin refactor mayor.

## Glossary

- **Despachos_Dev_Page**: La página React de solo lectura objeto de esta especificación.
- **Listado**: El componente que muestra los despachos agrupados por estado (tablero kanban en escritorio, acordeón/pestañas en móvil).
- **Detalle**: El componente Drawer/Modal (basado en `Sheet` del UI kit) que muestra los datos de negocio, estado actual e historial de un despacho seleccionado.
- **Historial**: La línea de tiempo vertical construida a partir de la tabla `despacho_dev_actividad` para un despacho.
- **Catalogo_Estados**: Los datos cargados desde `public.despacho_dev_estados` (codigo, nombre, orden, es_final, es_activo), que son la fuente de verdad para nombre y orden de los estados.
- **Mapa_Estados**: Módulo local reutilizable que asocia cada `codigo` de estado con `{ nombre, color, orden, icono }` y expone helpers (`label`, `color`, `isFinal`). El nombre y orden provienen del `Catalogo_Estados`; color e icono se definen como mapa local.
- **Cliente_Supabase**: La instancia exportada en `src/supabase.js` (`@supabase/supabase-js` v2) usada para consultas y suscripciones realtime.
- **Scope_Usuario**: Los valores `tenant_id`, `company` y `bodega_id` derivados de los claims del JWT del usuario autenticado, usados por RLS (`dd_tenant_id()`/`dd_company()`/`dd_bodega_id()`).
- **Despacho**: Un registro de `public.despacho_dev_despachos`.
- **Chofer**: Un registro de `public.despacho_dev_choferes`, resuelto vía `chofer_id`.
- **Despacho_Activo**: Un despacho con `deleted_at IS NULL` y `estado <> 'eliminado'`.
- **Estado_Realtime**: El estado de la conexión de suscripción realtime de Supabase (activa, degradada o no disponible).

## Requirements

### Requirement 1: Cargar el catálogo de estados

**User Story:** Como usuario administrativo, quiero que la página use el catálogo oficial de estados, para que los nombres y el orden de los grupos sean consistentes con el módulo de origen.

#### Acceptance Criteria

1. WHEN la Despachos_Dev_Page se monta, THE Despachos_Dev_Page SHALL cargar el Catalogo_Estados desde `public.despacho_dev_estados` mediante el Cliente_Supabase en un máximo de 5 segundos.
2. IF la carga del Catalogo_Estados falla o supera 5 segundos, THEN THE Despachos_Dev_Page SHALL mostrar un mensaje de error indicando que no se pudo cargar el catálogo de estados y conservar la vista sin datos de estados hasta un reintento.
3. THE Mapa_Estados SHALL obtener `nombre` y `orden` de cada estado desde el Catalogo_Estados como fuente de verdad.
4. THE Mapa_Estados SHALL definir `color` e `icono` de cada estado mediante un mapa local, según la asociación: `creado` → #6b7280 / FileText; `en proceso` → #2563eb / Loader; `chofer_pendiente` → #d97706 / UserRound; `completo` → #0891b2 / CheckCircle2; `pendiente_validacion` → #7c3aed / ClipboardCheck; `despachado` → #059669 / Truck; `rechazado` → #dc2626 / XOctagon; `eliminado` → #9ca3af / Trash2; `finalizado` → #0891b2 / Lock.
5. IF un Despacho tiene un `estado` que no existe en el Mapa_Estados, THEN THE Mapa_Estados SHALL devolver el color neutro #9ca3af, el ícono FileText y el propio código de estado como etiqueta.
6. THE Mapa_Estados SHALL exponer los helpers `label(codigo)`, `color(codigo)` e `isFinal(codigo)` desde un único módulo reutilizable.
7. THE Mapa_Estados SHALL hacer que `isFinal(codigo)` devuelva `true` de forma determinista únicamente para los códigos de estado final `despachado` y `finalizado`, y `false` para cualquier otro código, incluidos los códigos no existentes en el Mapa_Estados.

### Requirement 2: Listado de despachos agrupado por estado

**User Story:** Como usuario administrativo, quiero ver los despachos agrupados por estado, para entender rápidamente en qué punto del flujo se encuentra cada uno.

#### Acceptance Criteria

1. WHEN la Despachos_Dev_Page carga el Listado, THE Listado SHALL consultar únicamente Despachos donde `deleted_at IS NULL` y `estado <> 'eliminado'`.
2. THE Listado SHALL agrupar los Despachos por el campo `estado`, mostrando un grupo por cada estado presente en el Catalogo_Estados con al menos un Despacho asociado.
3. THE Listado SHALL ordenar los grupos de estado de forma ascendente según el campo `orden` del Catalogo_Estados; IF dos o más estados comparten el mismo valor de `orden`, THEN THE Listado SHALL desempatar ordenando alfabéticamente de forma ascendente por el nombre del estado.
4. THE Listado SHALL ordenar los Despachos dentro de cada grupo por `created_at` de forma descendente; IF dos o más Despachos comparten el mismo valor de `created_at`, THEN THE Listado SHALL desempatar ordenando de forma descendente por el identificador del Despacho.
5. THE Listado SHALL excluir el grupo del estado `eliminado` de la visualización.
6. WHEN el ancho de la ventana (viewport) es mayor o igual a 1024px, THE Listado SHALL mostrar un tablero tipo kanban con una columna por estado, en el orden definido en el criterio 3.
7. WHEN el ancho de la ventana (viewport) es menor a 1024px, THE Listado SHALL mostrar un acordeón o pestañas con una sección por estado, en el orden definido en el criterio 3.
8. WHEN el ancho de la ventana (viewport) cruza el umbral de 1024px, THE Listado SHALL cambiar entre la vista kanban y la vista de acordeón o pestañas en un máximo de 500 milisegundos sin recargar la página.
9. IF la consulta de Despachos falla o no puede completarse, THEN THE Listado SHALL mostrar un mensaje de error indicando que no se pudieron cargar los despachos y SHALL conservar la última vista cargada sin datos parciales.
10. IF la consulta se completa y no existe ningún Despacho que cumpla los criterios de filtrado, THEN THE Listado SHALL mostrar un mensaje indicando que no hay despachos para mostrar.

### Requirement 3: Contenido de cada tarjeta de despacho

**User Story:** Como usuario administrativo, quiero ver los datos clave de cada despacho en su tarjeta, para identificarlo sin abrir el detalle.

#### Acceptance Criteria

1. WHEN el Listado renderiza una tarjeta de Despacho, THE Listado SHALL mostrar la `referencia`, la `tienda`, la `fecha` y las tarimas en formato "S/D" (con el valor de `tarimas_s` a la izquierda de la barra y el de `tarimas_d` a la derecha).
2. WHEN el Listado renderiza una tarjeta de Despacho, THE Listado SHALL mostrar una insignia de estado que incluya simultáneamente el color definido en el Mapa_Estados y el texto del estado, de modo que el estado no se comunique únicamente por color.
3. IF el estado del Despacho no existe en el Mapa_Estados, THEN THE Listado SHALL mostrar la insignia con un color neutro predeterminado y el texto del estado tal como está registrado, sin impedir el renderizado de la tarjeta.
4. WHERE el Despacho tiene un `chofer_id` asignado, THE Listado SHALL mostrar el nombre del Chofer en la tarjeta.
5. WHEN el Listado renderiza una tarjeta de Despacho, THE Listado SHALL mostrar el valor de `updated_at` como tiempo relativo respecto a la hora actual (por ejemplo, "hace 5 minutos").
6. IF un valor de negocio requerido para la tarjeta (`referencia`, `tienda`, `fecha`, `tarimas_s`, `tarimas_d`, estado, nombre del Chofer cuando `chofer_id` está asignado, o `updated_at`) es nulo, vacío o no numérico cuando se espera numérico, THEN THE Listado SHALL mostrar en su lugar un marcador de ausencia legible y visible (texto no vacío) sin dejar el campo en blanco y sin interrumpir el renderizado del resto de la tarjeta.

### Requirement 4: Barra de filtros del listado

**User Story:** Como usuario administrativo, quiero filtrar y buscar despachos, para localizar rápidamente los que me interesan.

#### Acceptance Criteria

1. WHEN el usuario ingresa texto en el campo de búsqueda, THE Listado SHALL filtrar los Despachos mostrando únicamente aquellos cuyo `referencia`, `tienda` o `placa` contenga el texto ingresado como coincidencia parcial e insensible a mayúsculas/minúsculas.
2. THE Listado SHALL proporcionar un filtro por estado de selección múltiple que limite los Despachos mostrados a aquellos cuyo estado coincida con al menos uno de los estados seleccionados; cuando no haya ningún estado seleccionado, THE Listado SHALL mostrar los Despachos de todos los estados.
3. WHEN el usuario define un rango de fechas con fecha de inicio y fecha de fin, THE Listado SHALL limitar los Despachos mostrados a aquellos cuyo campo `fecha` esté dentro del rango inclusivo (desde la fecha de inicio hasta la fecha de fin, ambas incluidas).
4. IF la fecha de inicio del rango es posterior a la fecha de fin, THEN THE Listado SHALL rechazar el rango, mantener sin cambios los Despachos mostrados y presentar una indicación de error señalando que el rango de fechas es inválido.
5. THE Listado SHALL combinar la búsqueda de texto, el filtro por estado y el rango de fechas de forma acumulativa (conjunción lógica), mostrando únicamente los Despachos que satisfagan simultáneamente todos los filtros activos.
6. THE Listado SHALL proporcionar una acción de "limpiar filtros" que restablezca la búsqueda a texto vacío, el filtro de estado a sin selección y el rango de fechas a sin fechas, y que actualice los Despachos mostrados al conjunto completo sin filtros.
7. THE Listado SHALL mostrar un contador con la cantidad de Despachos visibles tras aplicar los filtros, actualizándolo cada vez que cambie cualquier filtro.
8. IF tras aplicar los filtros no existe ningún Despacho que cumpla los criterios, THEN THE Listado SHALL mostrar el contador en cero y presentar un estado vacío indicando que no hay resultados.
9. WHERE la biblioteca recharts está disponible y la opción de resumen está habilitada, THE Listado SHALL mostrar un mini-resumen con la cantidad de Despachos por estado calculada sobre los Despachos visibles tras aplicar los filtros.

### Requirement 5: Detalle de despacho (solo lectura)

**User Story:** Como usuario administrativo, quiero abrir un detalle de un despacho, para revisar todos sus datos de negocio y su estado actual.

#### Acceptance Criteria

1. WHEN el usuario selecciona un Despacho en el Listado, THE Detalle SHALL abrirse usando el componente Drawer/Modal (`Sheet`) del UI kit en un máximo de 2 segundos.
2. WHEN el Detalle se abre, THE Detalle SHALL mostrar los campos de negocio del Despacho: `company`, `bodega_nombre`, `tipo`, `referencia`, `tienda`, `placa`, `marchamo`, `puerta`, `notas`, `transportista`, `con_dua`, `numero_dua`, `tarimas_s`, `tarimas_d` y `fotos_count`.
3. WHERE un campo de negocio del Despacho no tiene valor (nulo o vacío), THE Detalle SHALL mostrar un indicador de campo sin valor (guion "—") en lugar de omitir el campo.
4. WHEN el Detalle se abre, THE Detalle SHALL mostrar el estado actual como insignia con el color definido en el Mapa_Estados y el texto correspondiente a ese estado.
5. WHERE el Despacho tiene `estado_motivo` con valor, THE Detalle SHALL mostrar el `estado_motivo`.
6. WHERE el Despacho tiene `chofer_id` asignado, THE Detalle SHALL mostrar los datos del Chofer (`nombre`, `cedula`, `placa_camion`, `placa_contenedor`) resueltos desde `public.despacho_dev_choferes`.
7. IF el Despacho tiene `chofer_id` asignado pero los datos del Chofer no pueden resolverse desde `public.despacho_dev_choferes`, THEN THE Detalle SHALL mostrar un indicador visible informando que los datos del Chofer no están disponibles, sin bloquear la visualización del resto del Detalle.
8. WHEN el Detalle se abre, THE Detalle SHALL mostrar las marcas de tiempo `fecha`, `finalized_at` y `reopened_at`, mostrando el indicador de campo sin valor (guion "—") para cada marca de tiempo que no tenga valor.
9. THE Detalle SHALL ser de solo lectura y NO SHALL ofrecer controles para cambiar el estado ni editar el Despacho.
10. IF la carga de los datos del Despacho o de su Historial falla, THEN THE Detalle SHALL mostrar un mensaje de error indicando que los datos no pudieron cargarse y NO SHALL mostrar datos parciales o desactualizados como definitivos.
11. WHERE la biblioteca de exportación (jspdf o exceljs) está disponible y la opción de exportación está habilitada, THE Detalle SHALL permitir exportar los datos de negocio y el Historial del Despacho.
12. IF la exportación de los datos de negocio o del Historial falla, THEN THE Detalle SHALL mostrar un mensaje de error indicando que la exportación no se completó y SHALL conservar el Detalle abierto sin alterar los datos mostrados.

### Requirement 6: Historial de cambios del despacho

**User Story:** Como usuario administrativo, quiero ver el historial de cambios de un despacho, para entender su trazabilidad y quién realizó cada acción.

#### Acceptance Criteria

1. WHEN el Detalle de un Despacho está abierto, THE Historial SHALL consultar `public.despacho_dev_actividad` filtrando por `entidad = 'despacho'` y `entidad_id = <id del Despacho>`.
2. THE Historial SHALL ordenar las entradas por `created_at` de forma descendente, y cuando dos o más entradas compartan el mismo valor de `created_at`, THE Historial SHALL mantener un orden estable y determinista entre ellas.
3. THE Historial SHALL mostrar cada entrada como un elemento de una línea de tiempo vertical con `descripcion`, `actor_email` y `created_at`, mostrando `created_at` con fecha y hora hasta el nivel de minutos.
4. THE Historial SHALL usar el texto de `descripcion` directamente como contenido legible de cada entrada.
5. WHERE el campo `detalle` de una entrada contiene tanto `estadoAnterior` como `estadoNuevo` con valores no vacíos, THE Historial SHALL mostrar la transición entre ambos estados aplicando el color del Mapa_Estados a cada estado.
6. IF el campo `detalle` de una entrada contiene solo uno de los campos `estadoAnterior` o `estadoNuevo`, o ninguno de ellos, THEN THE Historial SHALL mostrar únicamente el contenido de `descripcion` sin mostrar la transición de estados.
7. IF el Historial de un Despacho no contiene entradas, THEN THE Historial SHALL mostrar un mensaje indicando que no existen registros de actividad.
8. IF la consulta a `public.despacho_dev_actividad` falla o no puede completarse, THEN THE Historial SHALL mostrar un mensaje de error indicando que no se pudo cargar el historial y SHALL preservar el Detalle del Despacho abierto sin alterar sus datos.

### Requirement 7: Actualización en tiempo real (deseable)

**User Story:** Como usuario administrativo, quiero que la página se actualice automáticamente cuando cambian los datos, para trabajar con información vigente sin recargar.

#### Acceptance Criteria

1. WHEN la Despachos_Dev_Page está montada, THE Despachos_Dev_Page SHALL suscribirse mediante el Cliente_Supabase a los cambios de `public.despacho_dev_despachos` dentro del Scope_Usuario en un plazo máximo de 5 segundos desde el montaje.
2. WHEN se recibe un cambio realtime en `despacho_dev_despachos` dentro del Scope_Usuario, THE Listado SHALL refrescar los Despachos afectados en un plazo máximo de 2 segundos desde la recepción del evento, conservando la posición de desplazamiento y los filtros activos.
3. IF se recibe un cambio realtime que corresponde a un Despacho fuera del Scope_Usuario, THEN THE Listado SHALL ignorar el evento y SHALL mantener el listado sin modificaciones.
4. WHILE el Detalle de un Despacho está abierto, THE Historial SHALL suscribirse a los cambios de `public.despacho_dev_actividad` para ese `entidad_id` y SHALL refrescar la línea de tiempo en un plazo máximo de 2 segundos cuando se reciban nuevas entradas.
5. WHEN la Despachos_Dev_Page se desmonta o el Detalle se cierra, THE Despachos_Dev_Page SHALL cancelar y liberar la totalidad de las suscripciones realtime correspondientes en un plazo máximo de 2 segundos, sin dejar suscripciones activas asociadas al componente cerrado.
6. IF la conexión realtime no está disponible, THEN THE Despachos_Dev_Page SHALL continuar mostrando los datos cargados por consulta, SHALL mostrar un indicador no bloqueante que informe que la actualización automática está inactiva, y SHALL evitar mostrar cualquier error que impida el uso del listado o del detalle.
7. WHILE la conexión realtime está inactiva, THE Despachos_Dev_Page SHALL reintentar el restablecimiento de las suscripciones cada 15 segundos y SHALL retirar el indicador de actualización inactiva dentro de los 5 segundos posteriores a la reconexión exitosa.

### Requirement 8: Estados de interfaz (UI states)

**User Story:** Como usuario administrativo, quiero mensajes claros en cada situación de la página, para entender qué está ocurriendo en todo momento.

#### Acceptance Criteria

1. WHILE una consulta de datos está en curso, THE Despachos_Dev_Page SHALL mostrar un estado de carga con esqueletos (`Skeleton`) del UI kit dentro de los 200 milisegundos posteriores al inicio de la consulta.
2. WHEN una consulta de datos finaliza con éxito, THE Despachos_Dev_Page SHALL reemplazar el estado de carga por el contenido correspondiente y ocultar los esqueletos (`Skeleton`).
3. IF una consulta de datos falla o excede un tiempo de espera de 30 segundos, THEN THE Despachos_Dev_Page SHALL mostrar un estado de error (`ErrorState`) con un mensaje en español que indique que la consulta no pudo completarse, ofrecer una acción de reintento y preservar los filtros aplicados sin exponer detalles técnicos.
4. WHERE el número de Despachos activos en el Scope_Usuario es igual a 0, THE Despachos_Dev_Page SHALL mostrar un estado vacío (`EmptyState`) con un mensaje en español que indique que no existen Despachos activos.
5. WHERE los filtros aplicados producen 0 resultados y existe al menos 1 Despacho activo en el Scope_Usuario, THE Listado SHALL mostrar un mensaje en español de "sin resultados para el filtro", visualmente y textualmente distinto del estado vacío general (`EmptyState`), e incluir una acción para limpiar o restablecer los filtros.
6. IF el usuario no tiene permiso o scope para ver los datos, THEN THE Despachos_Dev_Page SHALL mostrar un mensaje en español de sin-permiso/sin-scope que indique la falta de acceso, sin renderizar el listado ni los datos, y sin exponer detalles técnicos (rutas, identificadores internos, mensajes de excepción o trazas).

### Requirement 9: Alcance, permisos y rendimiento

**User Story:** Como responsable de seguridad y desempeño, quiero que la página respete el alcance del usuario y consulte de forma eficiente, para proteger los datos y mantener buen rendimiento.

#### Acceptance Criteria

1. WHEN la Despachos_Dev_Page consulte datos, THE Despachos_Dev_Page SHALL usar el Cliente_Supabase con la clave anónima y SHALL aplicar RLS para filtrar por el Scope_Usuario (`tenant_id`, `company`, `bodega_id`), devolviendo únicamente registros cuyos tres campos coincidan con el perfil del usuario autenticado.
2. THE Despachos_Dev_Page SHALL exponer `tenant_id`, `company` y `bodega_id` como filtros/props preparados para una futura vista multi-scope, sin modificar ni desactivar ninguna política RLS existente.
3. THE Despachos_Dev_Page SHALL NOT usar la clave de servicio (service role) en el frontend Vite.
4. IF una consulta intenta ejecutarse con la clave de servicio (service role) desde el frontend Vite, THEN THE Despachos_Dev_Page SHALL bloquear la operación, no realizar ninguna lectura de datos, y mostrar un mensaje de error indicando que la operación no está permitida.
5. WHEN la Despachos_Dev_Page cargue el Listado, THE Listado SHALL limitar los resultados a un máximo de 50 registros por estado, ordenados por `created_at` en orden descendente dentro de la propia consulta, aplicando paginación para acceder a registros adicionales.
6. WHEN la Despachos_Dev_Page construya las consultas del Listado, THE Despachos_Dev_Page SHALL estructurar los filtros y el orden para aprovechar el índice `(tenant_id, company, bodega_id, estado, created_at desc)`.
7. IF una consulta falla o no puede completarse (por ejemplo, error de red, RLS deniega el acceso o expira el tiempo de espera de 30 segundos), THEN THE Despachos_Dev_Page SHALL no mostrar datos parciales, conservar el estado previo de la vista y mostrar un mensaje de error indicando que no se pudieron cargar los datos.

### Requirement 10: Vista multi-tenant/bodega (pregunta abierta / extensión futura)

**User Story:** Como usuario administrativo multi-bodega, quiero potencialmente ver despachos de varios tenants o bodegas, para supervisar más de una operación, entendiendo que esto es un cambio de seguridad que requiere aprobación.

#### Acceptance Criteria

1. THE Despachos_Dev_Page SHALL documentar la vista multi-tenant/bodega (Opción B) como pregunta abierta en la sección de extensiones futuras del documento.
2. IF no existe una aprobación explícita registrada para la vista multi-tenant/bodega, THEN THE Despachos_Dev_Page SHALL NOT implementar ni habilitar la vista multi-tenant/bodega, y SHALL mantener el alcance limitado al tenant, company y bodegaId del perfil activo.
3. WHERE la vista multi-scope es aprobada explícitamente por escrito, THE solución SHALL aplicar el control de acceso mediante una política RLS para un rol administrativo o una consulta con service role ejecutada desde una edge function o backend.
4. IF la vista multi-scope es implementada tras aprobación, THEN THE solución SHALL NOT exponer la clave de servicio (service role) en el frontend Vite, y SHALL restringir su uso al entorno backend/edge function.

### Requirement 11: Accesibilidad y calidad de código

**User Story:** Como usuario que depende de accesibilidad y como mantenedor del código, quiero que la página sea accesible y cumpla las reglas del proyecto, para garantizar usabilidad y mantenibilidad.

#### Acceptance Criteria

1. THE Despachos_Dev_Page SHALL mostrar en cada insignia de estado de Despacho una etiqueta de texto legible que identifique el estado, de modo que el estado sea identificable sin depender únicamente del color.
2. WHEN el usuario abre el Detalle en el Drawer/Modal, THE Detalle SHALL mover el foco al primer elemento interactivo del contenedor, confinar el foco dentro del contenedor mientras permanezca abierto, mantener un indicador de foco visible en cada elemento enfocable y exponer los roles ARIA de diálogo (`role="dialog"` con `aria-modal="true"`).
3. WHEN el usuario presiona la tecla Escape con el Detalle abierto, THE Detalle SHALL cerrar el Drawer/Modal y devolver el foco al elemento que activó su apertura.
4. THE Despachos_Dev_Page SHALL obtener todos los valores de color y espaciado desde los tokens de `src/styles/theme.js`, sin ningún valor de color o espaciado embebido en el código de la página.
5. WHERE se requieran valores de color o espaciado no existentes en el tema, THE Despachos_Dev_Page SHALL extender `src/styles/theme.js` con los nuevos tokens antes de utilizarlos.
6. THE Despachos_Dev_Page SHALL pasar la verificación `npm run lint` (ESLint 9, incluida la regla `react-hooks`) con cero errores y cero advertencias, declarando las dependencias completas en los arreglos de dependencias de los efectos y cancelando la totalidad de las suscripciones realtime al desmontar el componente.
7. THE Despachos_Dev_Page SHALL reutilizar los componentes existentes del UI kit en `src/components/ui/` (`Sheet`, `Badge`/`StatusPill`, `SearchInput`, `EmptyState`, `ErrorState`, `Skeleton`, `Card`), sin crear en la página componentes duplicados equivalentes a los ya disponibles.
