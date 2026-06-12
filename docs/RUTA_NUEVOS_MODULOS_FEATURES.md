# Ruta para crear nuevos modulos o features en AppoloDesk

Esta guia define el camino recomendado cada vez que la empresa solicite un
nuevo modulo, submodulo o feature. La idea es evitar que el app crezca como una
coleccion de pantallas sueltas: cada cambio debe quedar bien ubicado en la
navegacion, protegido por permisos, acotado por tenant/company y conectado al
flujo operativo real.

## 1. Entender que se esta construyendo

Antes de abrir codigo, clasificar la solicitud:

- **Modulo:** nueva area principal de trabajo. Debe aparecer como tarjeta en
  `/areas`, en el sidebar global y en la paleta de busqueda. Ejemplos:
  Mantenimiento, Recepcion, MRP Tarimas.
- **Submodulo:** hub interno dentro de un modulo, normalmente con tarjetas hacia
  features hijas. Ejemplos: OTs dentro de Mantenimiento, Pesaje Tarimas dentro
  de Servicios Generales.
- **Feature:** pantalla final que ejecuta una tarea concreta: lista, detalle,
  formulario, dashboard, metrica, consulta o exportacion.

Si la solicitud no necesita una nueva entrada de navegacion, probablemente es
una mejora de feature existente, no un modulo nuevo.

## 2. Preguntas iniciales

Usar estas preguntas como intake minimo:

- **Problema:** Que proceso manual o dolor operativo resuelve?
- **Usuario:** Quien lo usa: operativo, administrativo, dev, EPA, mantenimiento,
  salud ocupacional, recepcion u otro grupo?
- **Permiso:** Que permiso del perfil debe habilitarlo? Ya existe en
  `profile.permisos` o hay que crear uno nuevo?
- **Alcance:** Debe ver solo datos del tenant/company del usuario o es una
  vista global?
- **Flujo:** Cuales son los estados del proceso desde creado hasta cerrado?
- **Datos:** Que campos se capturan, cuales son obligatorios y cuales se derivan?
- **Responsables:** Quien puede crear, editar, finalizar, rechazar o borrar?
- **Historial:** Hace falta auditoria, timestamps, creador, asignado o cambios?
- **Adjuntos:** Requiere Storage, imagenes, PDF, Excel, QR o email?
- **Metricas:** Habra dashboard, filtros por fecha, exportacion o resumen?
- **Integraciones:** Necesita Cloud Functions, SQL/Supabase, correo u otro
  servicio externo?
- **Criterio de cierre:** Que debe pasar para decir "esto esta listo"?

## 3. Disenar el modelo de datos

Definir el contrato antes de crear pantallas:

- Nombre de coleccion en Firestore.
- Estructura de documentos y subcolecciones.
- Campos de scope obligatorios: `tenantId` y `company`, salvo excepcion
  justificada.
- Campos de autoria: `createdBy`, `createdByName`, `createdAt`, `updatedAt`.
- Estados validos y transiciones permitidas.
- Campos calculados para busqueda, metricas o ordenamiento.
- Indices requeridos por queries con `where` + `orderBy`.
- Compatibilidad con documentos legacy, si se reutiliza una coleccion vieja.

Regla general: los documentos de negocio deben cargar `tenantId` y `company`, y
el cliente debe leerlos desde `AuthCtx.profile`, no desde inputs manuales.

## 4. Definir permisos y seguridad

La seguridad se implementa en dos capas.

**Cliente, para experiencia y filtros defensivos:**

- Usar `AuthCtx` para leer `user`, `profile`, `permisos`, `role`, `epaAdmin` y
  `loading`.
- Bloquear o redirigir pantallas cuando falte el permiso requerido.
- Filtrar datos con `where("tenantId", "==", profile.tenantId)` y
  `where("company", "==", profile.company)` cuando sea viable.
- Si la coleccion tiene documentos legacy sin scope, usar helpers de
  `src/utils/dataScope.js`.

**Firestore Rules, como autoridad real:**

- Crear helper de permiso si hace falta: `hasPerm("miPermiso")` o admin/dev.
- En `create`, exigir `sameTenantCompanyData(request.resource.data)`.
- En `read/update/delete`, validar `sameTenantCompanyData(resource.data)`.
- En `update`, limitar campos con `diff(...).changedKeys().hasOnly([...])`.
- En `delete`, preferir admin/dev salvo que el proceso requiera otra regla.

Si hay Cloud Functions, repetir la validacion server-side: cargar
`profiles/{uid}`, verificar permiso, `tenantId` y `company`, y no confiar en el
scope enviado por el cliente.

## 5. Ubicarlo en la navegacion

Cada modulo o submodulo visible debe quedar conectado en los puntos correctos:

- `src/App.jsx`: importar pagina y declarar la ruta dentro de `PrivateRoute`.
- `src/config/workAreas.jsx`: agregar area o `subModules`. Esto alimenta el hub
  `/areas`, el sidebar global y la paleta de comandos.
- `src/components/ui/routeTrail.js`: agregar etiqueta en `LEAF_LABELS` si es una
  ruta detalle con parametro que no aparece en `workAreas`.
- `src/config/epaOnlyUids.js` y `EpaAdminRouteGuard.jsx`: tocar solo si la ruta
  debe ser visible para usuarios restringidos EPA.
- `docs/ESTRUCTURA_PAGINAS.md`: actualizar la jerarquia modulo/submodulo/feature.

Para modulos nuevos, crear una carpeta bajo `src/pages/<Modulo>/`. Si el nombre
tiene espacios, recordar citarlo en comandos de shell.

## 6. Construir la UI con el kit existente

Las pantallas deben usar el sistema compartido de `src/components/ui/`:

- Layout base: `Shell`, `Topbar`, `Brand`, `Main`, `Container`.
- Hub de modulo: `Hero`, `Badge`, `QuickCard`, `ModuleGrid`, `ModuleCard`.
- Contenido operativo: `Card`, `RowCard`, `KpiCard`, `StatusPill`,
  `SearchInput`, `Field`, `Sheet`, `EmptyState`, `Spinner`, `TableScroll`.
- Botones: `PrimaryButton`, `SecondaryButton`, `GhostButton` o `Button`.
- Iconos: `lucide-react`.
- Tokens visuales: importar desde `src/styles/theme.js`; evitar hex codes
  nuevos en paginas.

Un modulo nuevo normalmente empieza con un hub. Un feature normalmente empieza
con Topbar + Hero compacto + area de trabajo real.

## 7. Implementar datos y servicios

Mantener la logica de datos lo mas clara posible:

- Para listeners o operaciones reutilizables, crear archivo en `src/services/`.
- Para calculos puros de dashboard/metrica, crear helpers junto al feature
  como en `src/pages/Mantenimiento/OTs/dashboard/`.
- Limpiar suscripciones `onSnapshot` en `useEffect`.
- Mostrar estados de carga, vacio y error.
- No mezclar agregaciones complejas directamente dentro de componentes grandes
  si pueden vivir en helpers testeables.
- Si hay exportacion Excel/PDF, aislarla en `src/utils/`.

## 8. Validar el flujo end to end

Antes de cerrar:

- Login con usuario autorizado.
- Usuario sin permiso no debe ver o abrir el modulo.
- Datos de otro tenant/company no deben aparecer.
- Crear documento guarda `tenantId`, `company`, autoria y timestamps.
- Actualizar solo permite campos esperados.
- Estados del proceso avanzan correctamente.
- Listas, detalles, filtros, busquedas y vacios funcionan.
- Sidebar, hub, paleta de busqueda, pins y breadcrumbs apuntan a rutas validas.
- Mobile y desktop no rompen layout.
- Firestore rules no bloquean el flujo legitimo ni abren datos indebidos.

Comandos de verificacion locales:

```bash
npm run lint
npm run build
```

## 9. Donde terminar

Una implementacion se considera cerrada cuando:

- La ruta existe en `App.jsx` y esta protegida correctamente.
- La navegacion esta actualizada en `workAreas.jsx`.
- La pagina usa el UI kit y respeta el look de AppoloDesk.
- Firestore rules cubren lectura, creacion, actualizacion y borrado.
- Los documentos nuevos tienen scope `tenantId` + `company`.
- Las queries filtran por scope o pasan por `dataScope`.
- El permiso esta documentado y probado con al menos un usuario autorizado y
  uno no autorizado.
- `docs/ESTRUCTURA_PAGINAS.md` refleja la nueva jerarquia.
- `npm run lint` y `npm run build` pasan, o queda documentado por que no se
  pudieron ejecutar.

## Checklist rapida
 
- [ ] Clasifique: modulo, submodulo o feature.
- [ ] Respondi las preguntas de intake.
- [ ] Defini coleccion, schema, estados y ownership.
- [ ] Defini permiso y scope.
- [ ] Actualice Firestore rules.
- [ ] Cree o actualice pagina en `src/pages/`.
- [ ] Agregue ruta en `src/App.jsx`.
- [ ] Actualice `src/config/workAreas.jsx`.
- [ ] Actualice breadcrumbs para rutas detalle si aplica.
- [ ] Use componentes de `src/components/ui/`.
- [ ] Agregue servicios/helpers si hay logica de datos reusable.
- [ ] Verifique tenant/company en cliente y reglas.
- [ ] Actualice documentacion.
- [ ] Ejecute lint/build.

