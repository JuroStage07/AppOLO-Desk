# Base de conocimiento — Asistente AppoloDesk

> Documento funcional para el asistente conversacional de AppoloDesk. Describe el estado del código al 21 de julio de 2026. No contiene datos operativos en vivo ni secretos.

## 1. Qué es AppoloDesk

AppoloDesk es la plataforma web interna de OLO Logistics para despacho, seguridad, recepción, mantenimiento, servicios generales, EPA, MRP de tarimas, reportes y administración.

- Frontend: React 19 + Vite, desplegado en Firebase Hosting.
- Identidad y datos operativos: Firebase Auth, Firestore y Storage.
- Backend: Cloud Functions Node 20 en `us-central1`.
- MRP Tarimas: Supabase con RLS y funciones RPC.
- Asistente: webhook configurable mediante `VITE_ASSISTANT_WEBHOOK_URL`, normalmente conectado a n8n.
- Idioma de la interfaz y del asistente: español.

## 2. Inicio de sesión y alcance operativo

`AuthProvider.jsx` escucha Firebase Auth y carga `profiles/{uid}`. Si el perfil no existe o no puede leerse, cierra la sesión; no existe un estado válido de usuario autenticado sin perfil.

El contexto expone `user`, `profile`, `permisos`, `role`, `tenantId`, `company`, `bodegaId`, `bodegaNombre`, `epaAdmin`, `loading` y `error`.

Las rutas privadas aplican, en orden:

1. `RequireAuth`: exige usuario y perfil.
2. `RequireTenant`: exige `tenantId` y `bodegaId` en `localStorage["appolo_profile"]`.
3. `EpaAdminRouteGuard`: limita a los usuarios EPA restringidos.
4. `RequireRouteAccess`: compara la ruta con el rol y los permisos.

`/config-region` requiere login, pero no tenant/bodega previos. Allí se eligen país, compañía y bodega. El selector de bodega de la barra superior actualiza tanto `profiles/{uid}` como la copia de `localStorage`; ambas deben mantenerse sincronizadas.

### Países y bodegas configuradas

- Costa Rica (`CR`, compañía `OLO`): CLIRO (`CR-OLO-CLIRO`) y El Coco (`CR-OLO-ELCOCO`).
- Venezuela (`VNZ`, compañía `OLO`): San Diego (`VNZ-OLO-SANDIEGO`) y Michelena (`VNZ-OLO-MICHELENA`).

El alcance actual es `tenantId + company + bodegaId`. Firestore está en una fase de transición: `sameTenantScopeData` exige tenant/company y acepta temporalmente documentos legacy sin bodega; cuando un documento sí tiene `bodegaId`, debe coincidir con el perfil. Nunca se deben mezclar datos entre tenants, compañías o bodegas.

## 3. Roles, permisos y EPA

Roles:

- `dev`: acceso completo y herramientas internas.
- `administrativo`: acceso administrativo general, sin herramientas dev.
- `operativo`: solo módulos habilitados explícitamente.

Permisos canónicos administrables:

| Clave | Controla |
|---|---|
| `despacho` | Despachos en progreso y finalizados |
| `recepcion` | Acciones de descarga y operación de Recepción |
| `recepcionReportes` | Reportes de Descarga y de Recepción |
| `canRecepcionCofersa` | Flujos COFERSA |
| `despachosEPA` | Flujos de Recepción/EPA |
| `saludOcupacional` | Seguridad: marcas, aperturas, terceros, visados y reportes |
| `documentacion` | Biblioteca documental |
| `epa` | Panel EPA |
| `mantenimiento` | Equipos, OTs y dashboard |
| `serviciosGenerales` | OTs y validación de ingreso |
| `pesajeTarimas` | Registro y consulta de pesajes |
| `mrpTarimas` | MRP de tarimas |
| `horasExtra` | Aprobaciones y reportes de horas extra |
| `gestionUsuarios` | Administración de perfiles, scope y permisos |

`zoneFranca` y `zonaFranca` son alias legacy de `pesajeTarimas`.

Los roles administrativo/dev actúan como override en la mayoría de módulos. Excepciones relevantes: Dev exige rol `dev`; Usuarios admite `dev` directamente o un administrativo con `gestionUsuarios`. Horas Extra exige rol administrativo/dev; aunque existe la clave `horasExtra`, el override administrativo hace que esos roles tengan acceso actualmente.

`profile.epaAdmin === true` restringe el usuario a `/`, `/welcome`, `/areas`, `/epa/*`, `/config-region` y el detalle de aperturas de Seguridad/Salud. No se deben sugerir otros módulos a ese usuario.

## 4. Navegación global

- `/login`: acceso público.
- `/config-region`: selección inicial de país y bodega.
- `/welcome`: bienvenida.
- `/` y `/areas`: hub de áreas.
- `/reportes`: centro global de reportes, filtrado por rol/permisos.
- `/pesado`: acceso rápido al pesaje de tarimas.
- La paleta de comandos, el menú circular, el sidebar y los módulos fijados respetan el mismo modelo de acceso.

El centro `/reportes` agrupa Reportes Seguridad, Reportes Recepción/Descarga, Dashboard de OTs y Reporte de Horas Extra según acceso. Las rutas específicas siguen siendo la fuente final.

## 5. Áreas y capacidades

### Despacho

- `/despacho`
- `/despacho/in-progress`: ocupación/carga en vivo.
- `/despacho/finalizados`: historial reciente.
- Requiere `despacho` o rol administrativo/dev.

### Seguridad

- `/seguridad/control-marcas` y `/seguridad/control-marcas/historial`.
- `/seguridad/aperturas`, finalizadas, rechazadas y detalle `/:id`.
- `/seguridad/visado/generar` y `/seguridad/visados`.
- `/documentacion`.
- `/seguridad/metricas`.
- Las rutas legacy `/salud/*` redirigen a `/seguridad/*`.
- Salud Ocupacional (`/salud-ocupacional`) sigue como área próxima; las funciones activas viven en Seguridad.

Finalizar una apertura genera una acción de descarga en Recepción. Visados y terceros requieren `saludOcupacional`; Documentación admite `documentacion` o `saludOcupacional` en navegación.

### Recepción

- `/recepcion/accion-descarga` y detalle `/:accionId`: lista, filtros, inicio y finalización de descargas.
- `/recepcion/metricas`: **Reportes de Descarga**, basado principalmente en `accion_descarga`; incluye cumplimiento, tiempos, productividad, andenes, proveedores, tendencias COFERSA/EPA y exportes Excel.
- `/recepcion/metricas-recepcion`: **Reportes de Recepción**, basado en `accion_recepcion`; incluye total, creadas, en proceso, completas, tiempo promedio, gráficos por tipo/andén/proveedor/usuario, tabla con filtros tipo Excel y exportación.
- El hub diferencia operación General, EPA y COFERSA según permisos.

### Mantenimiento

- `/mantenimiento/equipos` y detalle `/:id`: registro, edición, familias, revisión, fallas y envío de etiqueta QR por correo.
- `/mantenimiento/ots`: hub.
- `/mantenimiento/OTsPage`: tablero de gestión.
- `/mantenimiento/ots/finalizadas`.
- `/mantenimiento/ots/dashboard`: métricas de OTs.
- `/mantenimiento/ots-solicitud/:id`: detalle y subtareas.

Las OTs avanzan normalmente por `Solicitada → En proceso → En revisión → Finalizada`. Las subtareas pueden registrar tiempo. `tiempoRespuesta` se calcula al finalizar, excluyendo fines de semana.

### Servicios Generales y Zona Franca

- `/servicios-generales/ordenes-trabajo`: hub, creación y gestión de OTs.
- `/servicios-generales/validar-ingreso`.
- `/servicios-generales/pesaje-tarimas`, `/registrar` y `/consultar`.
- `/pesado` abre el mismo flujo de pesaje.

### EPA

- `/epa` y `/epa/aperturas-finalizadas`.
- Muestra aperturas finalizadas de tipo EPA.
- Usuarios `epaAdmin` quedan restringidos a esta área y al detalle permitido de aperturas.

### Administración y Horas Extra

- `/administracion`.
- `/administracion/usuarios`: rol, los 14 permisos, `epaAdmin`, tenant/company y bodega.
- `/horas-extra`: aprobación de coordinador.
- `/horas-extra/gerencia`: validación gerencial.
- `/horas-extra/reporte`: reporte mensual.
- `/horas-extra/usuarios`: coordinadores y overrides de horario.
- `/horas-extra/marcas`: marcas de asistencia.

Los datos provienen de SQL Server/Bit2 mediante Cloud Functions. No inventar marcas, horas ni decisiones concretas.

### Dev

- `/dev/update-supabase`.
- `/dev/config-modulos/horas-extra`.
- `/dev/config-modulos/mrp-tarimas`.
- `/dev/config-modulos/mrp-tarimas/entidades`: relación bodega ↔ almacén MRP.
- `/dev/config-modulos/mrp-tarimas/motivos`: motivos por tipo de ajuste o traslado.

Solo rol `dev`.

## 6. MRP Tarimas

MRP fue reconstruido sobre Supabase. Requiere `mrpTarimas` o rol administrativo/dev y opera con `tenantId/company` del perfil. El almacén no se elige manualmente: se resuelve desde `profiles/{uid}.bodegaId` mediante `pallet_warehouses.bodega_id`. Si no existe vínculo, un dev debe configurarlo.

Rutas:

- `/mrp-tarimas/dashboard`: resumen.
- `/mrp-tarimas/inventario`: existencias por artículo y ubicación; permite ajustes y traslados.
- `/mrp-tarimas/movimientos`: historial.
- `/mrp-tarimas/descartes`: ajustes negativos.
- `/mrp-tarimas/catalogos`: artículos, insumos, BOM y almacenes.

Ubicaciones operativas: `tienda`, `almacen`, `patio`, `reparacion`, `merma`, `pend` (Pendiente).

Reglas críticas:

- Un ajuste positivo ingresa stock a `pend`.
- Un ajuste negativo descuenta stock desde una ubicación operativa y crea un registro en descartes.
- `merma` es una ubicación operativa y su stock cuenta en el total.
- `descartes` es un registro administrativo; no es una ubicación y no crea stock.
- Los traslados internos mueven stock entre ubicaciones distintas.
- Los traslados entre almacenes buscan el artículo destino por nombre y pueden crearlo si no existe.
- Los motivos son configurables para `ajuste_positivo`, `ajuste_negativo`, `traslado` y `traslado_almacen`; si no hay catálogo, la app usa motivos de respaldo.
- Catálogos: artículos por almacén; insumos y BOM por tenant/company; almacenes por tenant/company.

Existe una integración backend `consumeTarimasFromExternalApp`: mueve tarimas de `almacen` a `tienda`, usa `externalEventId` para idempotencia y valida permiso, scope, bodega, artículo y stock antes de llamar el RPC `mrp_consume_tarimas_external`.

## 7. Acciones del asistente

El asistente devuelve siempre orientación y, solo para los tipos soportados, un borrador confirmable. n8n no escribe directamente.

### `create_ot_draft`

Campos obligatorios: `nombreOT`, `activoReferencia`, `departamento`, `lugarProblema`, `tipoProblema`, `descripcionOT`. `notas` es opcional. Los campos de catálogo deben coincidir con las opciones oficiales definidas en `appolo-knowledge.json`.

La app valida, permite corregir y, al confirmar, crea `solicitudesOT` con estado `Solicitada`, número `SOL-OT-<timestamp>`, auditoría, solicitante, tenant/company y bodega.

### `mrp_transfer_draft`

Propone un traslado entre ubicaciones del almacén MRP activo. Requiere artículo (`articuloId` o `articuloCodigo`), cantidad entera positiva, origen y destino válidos y distintos; motivo es opcional. La app valida stock disponible y ejecuta el traslado solo al confirmar.

No usar este action para traslados entre almacenes. Nunca afirmar que una OT o un traslado se completó antes de que la app devuelva estado `created`.

## 8. Datos y seguridad

Firestore relevante incluye `profiles`, `usernames`, `despachos`, `equipos`, `checklists_diarias`, `solicitudesOT` y subtareas, `accion_descarga`, `accion_recepcion`, `aperturas`, `aperturasRecepcion`, `recepcionCofersa_lotes`, `tareas_apertura`, marcas, terceros, visados, documentación, colecciones, chats, dashboards, pesajes y colecciones `overtime*`.

Supabase MRP incluye `pallet_warehouses`, `pallet_articulos`, `pallet_inventory_articulo`, `pallet_movimientos_articulo`, `pallet_descartes_articulo`, `pallet_motivos`, `pallet_external_consumptions`, `mrp_insumos`, `mrp_boms` y `mrp_bom_insumos`.

Cloud Functions actuales:

- `sendEquipoQrLabel`.
- `consumeTarimasFromExternalApp`.
- `testSqlConnection`.
- `getOvertimeRecords`.
- `decideOvertimeRecord`.
- `getOvertimeCoordinators`.
- `saveCoordinatorEmails`.

Reglas obligatorias del asistente:

- No revelar credenciales SMTP, SQL, Firebase o Supabase.
- No inventar datos operativos, stock, métricas, usuarios, estados o movimientos.
- No mezclar tenant, company o bodega.
- Respetar rol, permisos y `epaAdmin` al sugerir rutas.
- Si falta información, decirlo y orientar a la ruta correcta.
- Solo `create_ot_draft` y `mrp_transfer_draft` pueden producir acciones; el resto es orientación.

## 9. Mantenimiento de este conocimiento

- `src/config/workAreas.jsx` es la fuente de áreas, módulos y gates.
- `src/App.jsx` es la fuente de rutas.
- `docs/assistant-knowledge/appolo-capabilities.json` contiene capacidades detalladas.
- `npm run assistant:knowledge` sincroniza áreas, rutas, navegación y capacidades hacia `docs/assistant-knowledge/appolo-knowledge.json` y `public/assistant-knowledge/appolo-knowledge.json`.
- Después de agregar rutas, módulos, permisos o acciones, actualizar primero las fuentes y capacidades, luego ejecutar la sincronización y validar ambos JSON.
