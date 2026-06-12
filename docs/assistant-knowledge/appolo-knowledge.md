# Base de conocimiento — Asistente AppoloDesk

> Documento fuente para alimentar al asistente conversacional de AppoloDesk
> (vía n8n / vector store en un paso posterior). Está escrito en español y
> describe **cómo funciona el sistema**, no datos operativos en vivo.
>
> Última revisión basada en el código: rama de UI del menú circular.

---

## 1. ¿Qué es AppoloDesk?

AppoloDesk es una **plataforma operativa interna** (aplicación web de una sola
página, React 19 + Firebase) usada por OLO Logistics para gestionar sus
procesos de planta: despacho, seguridad, recepción, mantenimiento, servicios
generales, EPA, MRP de tarimas y administración. La interfaz está en español.

- Frontend: React + Vite, desplegado en Firebase Hosting.
- Backend: Firebase Auth + Firestore + Storage + Cloud Functions (Node 20,
  región `us-central1`).
- No hay datos en vivo expuestos al asistente todavía: el bot responde sobre
  **funcionamiento, módulos y procesos**, no sobre registros concretos.

---

## 2. Login y autenticación

1. El usuario inicia sesión en `/login` (Firebase Auth).
2. `src/auth/AuthProvider.jsx` es la fuente de verdad en runtime: cuando
   `onAuthStateChanged` detecta sesión, carga el documento `profiles/{uid}` de
   Firestore.
3. **Si el perfil no existe o falla la lectura, se cierra sesión
   automáticamente.** No existe el estado "logueado sin perfil".
4. El contexto de auth expone: `{ user, profile, permisos, role, epaAdmin, loading, error }`.

### Guardas de ruta
Toda ruta protegida usa `PrivateRoute` = `RequireAuth` → `RequireTenant` → `EpaAdminRouteGuard`:

- **RequireAuth**: espera a que termine la carga; si no hay `user`/`profile`,
  redirige a `/login`.
- **RequireTenant**: lee `localStorage["appolo_profile"]`; si falta `tenantId`,
  redirige a `/config-region`. (La copia en localStorage y el perfil de
  Firestore son dos fuentes paralelas que deben mantenerse sincronizadas.)
- **EpaAdminRouteGuard**: si `profile.epaAdmin === true`, restringe la
  navegación a una lista blanca (`/`, `/welcome`, `/areas`, `/epa/*`,
  `/config-region`, `/seguridad/aperturas/detalle/*`) y manda el resto a `/epa`.

`/config-region` es la única ruta protegida que **no** exige tenant (sirve para
configurarlo).

---

## 3. Tenant y company (multi-tenant)

Cada documento de negocio lleva `tenantId` y `company`. El aislamiento es de dos
capas:

- **Servidor (autoritativo)**: `firestore.rules` usa `sameTenantCompanyData(data)`
  + ayudantes de permiso. Lecturas, creaciones y actualizaciones casi siempre
  exigen que el `tenantId`/`company` del documento coincida con el del perfil
  del solicitante.
- **Cliente (filtro defensivo)**: `src/utils/dataScope.js` filtra en memoria
  (`filterByUserScope`, etc.) porque algunos documentos legados no tienen campos
  de tenant.

**Regla clave para el bot:** nunca debe mostrar ni mezclar datos de un tenant o
company distinto al del usuario.

---

## 4. ¿Qué es `epaAdmin`?

`profile.epaAdmin` es una bandera adicional sobre el perfil. Cuando es `true`,
el usuario es un administrador EPA **restringido**: solo puede ver el área EPA y
unas pocas rutas permitidas. Se combina con `src/config/epaOnlyUids.js`
(`isEpaRestrictedUser`), que en el hub oculta todos los módulos excepto EPA para
esos usuarios.

---

## 5. Roles y permisos

Dos ejes ortogonales en `profiles/{uid}`:

- **`role`**:
  - `administrativo` y `dev` → acceso amplio (`isAdminRequester()` en las reglas).
  - `operativo` → accesos acotados (p. ej. checklists diarias de equipos).
- **`permisos`**: mapa de booleanos por módulo. Claves conocidas:
  - `permisos.mantenimiento`
  - `permisos.saludOcupacional`
  - `permisos.canRecepcionCofersa`
  - `permisos.despachosEPA`

Además, `role: "dev"` desbloquea rutas de desarrollo y `administrativo`/`dev`
desbloquean Administración y Horas Extra.

---

## 6. Áreas de trabajo

Fuente única: `src/config/workAreas.jsx` (`getVisibleAreas({ epaOnly, role })`).
El menú visible se filtra según rol y `epaOnly`.

### 6.1 Despacho
- **Ruta:** `/despacho` · **Tag:** Operación
- **Descripción:** Coordinación de carga, asignación de docks y seguimiento de
  despachos en tiempo real.
- **Módulos:** En progreso (`/despacho/in-progress`), Finalizados (`/despacho/finalizados`).
- **Preguntas que el bot podría responder:** cómo se sigue un despacho, qué
  significa "en progreso" vs "finalizado", dónde ver despachos cerrados.

### 6.2 Seguridad (SSO)
- **Ruta:** `/seguridad` · **Tag:** Seguridad
- **Descripción:** Gestión de visados, control de ingreso de terceros y
  registros de seguridad. (Marca "Seguridad"; las rutas legadas `/salud/*`
  redirigen a `/seguridad/*`.)
- **Módulos:**
  - Control de marcas (`/seguridad/control-marcas`) → Historial (`/seguridad/control-marcas/historial`)
  - Aperturas (`/seguridad/aperturas`) → Finalizadas (`/seguridad/aperturas/finalizadas`), Rechazadas (`/seguridad/aperturas/rechazadas`)
  - Visados (`/seguridad/visado`) → Generar visado (`/seguridad/visado/generar`), Administrar visados (`/seguridad/visados`)
  - Documentación (`/documentacion`)
  - Métricas (`/seguridad/metricas`)
- **Preguntas que el bot podría responder:** cómo generar un visado, dónde ver
  aperturas finalizadas/rechazadas, cómo consultar el control de marcas.

### 6.3 Salud Ocupacional
- **Ruta:** `/salud-ocupacional` · **Tag:** Próximamente
- **Descripción:** Bienestar, exámenes y seguimiento de salud del personal.
- **Estado:** `comingSoon` — placeholder, sin módulos activos. Los visados,
  control de terceros y aperturas viven ahora en **Seguridad**.
- **Preguntas que el bot podría responder:** "¿está disponible Salud
  Ocupacional?" → No todavía; redirigir a Seguridad para visados/aperturas.

### 6.4 Recepción
- **Ruta:** `/recepcion` · **Tag:** Inbound
- **Descripción:** Registro de ingresos, validación documental y trazabilidad de
  mercadería.
- **Módulos:** Acción descarga (`/recepcion/accion-descarga`), Métricas (`/recepcion/metricas`).
- **Preguntas que el bot podría responder:** qué es una acción de descarga, dónde
  ver métricas de recepción, clasificación General/EPA/COFERSA.

### 6.5 Mantenimiento
- **Ruta:** `/mantenimiento` · **Tag:** Mantenimiento
- **Descripción:** Control de equipos, checklists preventivos y gestión de fallas
  correctivas.
- **Módulos:**
  - Equipos (`/mantenimiento/equipos`)
  - Órdenes de trabajo (`/mantenimiento/ots`) → Tablero/Gestión (`/mantenimiento/OTsPage`), Finalizadas (`/mantenimiento/ots/finalizadas`), Dashboard (`/mantenimiento/ots/dashboard`)
- **Permiso asociado:** `permisos.mantenimiento` (además de admin/dev).
- **Preguntas que el bot podría responder:** cómo crear/seguir una OT, dónde ver
  el dashboard de OTs, cómo registrar un equipo, cómo se envía el QR de un equipo.

### 6.6 Servicios Generales
- **Ruta:** `/servicios-generales` · **Tag:** Servicios
- **Descripción:** Solicitudes internas, seguimiento de tareas y control de
  servicios de planta.
- **Módulos:**
  - Órdenes de trabajo (`/servicios-generales/ordenes-trabajo`) → Crear OT (`/servicios-generales/ordenes-trabajo/crear`), Gestión de OTs (`/servicios-generales/ordenes-trabajo/gestion`)
  - Validar ingreso (`/servicios-generales/validar-ingreso`)
  - Pesaje tarimas (`/servicios-generales/pesaje-tarimas`) → Registrar (`/servicios-generales/pesaje-tarimas/registrar`), Consultar (`/servicios-generales/pesaje-tarimas/consultar`)
- **Preguntas que el bot podría responder:** cómo crear una OT de servicios, cómo
  pesar/consultar tarimas, dónde validar un ingreso.

### 6.7 EPA
- **Ruta:** `/epa` · **Tag:** EPA
- **Descripción:** Panel exclusivo EPA: aperturas, reportes y administración
  centralizada.
- **Módulos:** Aperturas finalizadas (`/epa/aperturas-finalizadas`).
- **Acceso:** usuarios con `epaAdmin` solo ven esta área.
- **Preguntas que el bot podría responder:** qué ve un usuario EPA, dónde están
  las aperturas finalizadas EPA.

### 6.8 MRP Tarimas
- **Ruta:** `/mrp-tarimas` · **Tag:** MRP
- **Descripción:** Gestión integral de tarimas: inventario, reparaciones,
  materiales y costos.
- **Módulos:** Dashboard (`/mrp-tarimas/dashboard`), Inventario (`/mrp-tarimas/inventario`), Reparaciones (`/mrp-tarimas/reparaciones`), Materiales (`/mrp-tarimas/materiales`).
- **Preguntas que el bot podría responder:** dónde ver el inventario de tarimas,
  cómo registrar una reparación o material.

### 6.9 Administración *(solo `administrativo` / `dev`)*
- **Ruta:** `/administracion` · **Tag:** Administración
- **Descripción:** Gestión de usuarios, roles y permisos de la plataforma.
- **Módulos:** Usuarios (`/administracion/usuarios`), Horas Extra (`/horas-extra`) → Aprobaciones gerencia (`/horas-extra/gerencia`), Reporte mensual (`/horas-extra/reporte`).
- **Preguntas que el bot podría responder:** cómo se aprueban horas extra, dónde
  está el reporte mensual, cómo se gestionan usuarios y permisos.

### 6.10 Dev *(solo `dev`)*
- **Ruta:** `/dev` · **Tag:** Desarrollo
- **Descripción:** Herramientas internas de desarrollo: migraciones,
  sincronización y utilidades.
- **Módulos:** Update AppOLO Supabase (`/dev/update-supabase`), Configuración de
  módulos (`/dev/config-modulos`) → Horas Extra (`/dev/config-modulos/horas-extra`).

---

## 7. Rutas principales del sistema

| Ruta | Pantalla | Notas |
|------|----------|-------|
| `/login` | Login | Pública |
| `/config-region` | Configuración de tenant/región | Requiere login, NO tenant |
| `/welcome` | Bienvenida post-login (HomeHub) | Botón "Iniciar" → `/areas` |
| `/` y `/areas` | Hub principal (menú circular + modal de áreas) | |
| `/pesado` | Pesaje de tarimas (atajo Zona Franca) | |
| `/documentacion` | Biblioteca de documentos | |
| `/despacho`, `/despacho/in-progress`, `/despacho/finalizados` | Despacho | |
| `/seguridad/*` | Seguridad (control marcas, aperturas, visados, métricas) | `/salud/*` redirige aquí |
| `/recepcion`, `/recepcion/accion-descarga`, `/recepcion/metricas` | Recepción | |
| `/mantenimiento/*` | Equipos y OTs | |
| `/servicios-generales/*` | OTs, validar ingreso, pesaje tarimas | |
| `/epa`, `/epa/aperturas-finalizadas` | EPA | |
| `/mrp-tarimas/*` | MRP Tarimas | |
| `/administracion`, `/horas-extra/*` | Administración / Horas extra | admin o dev |
| `/dev/*` | Herramientas dev | solo dev |

---

## 8. Colecciones Firestore relevantes

`profiles`, `usernames`, `pushTokens`, `despachos` (+ subcolecciones `items`,
`fotos`, `layout`), `equipos`, `checklists_diarias`, `solicitudesOT` (+
`subtareas`), `subtaskList`, `accion_descarga`, `aperturas`,
`aperturasRecepcion`, `recepcionCofersa_lotes`, `tareas_apertura`,
`controlMarcas/{day}/marcas`, `usuariosTerceros`, `controlTerceros`, `visados`,
`visadosPorFirmar`, `documentacion`, `colecciones`, `fichas`,
`chats/{id}/mensajes`, `dashboard_salud_daily`, `pesajes`,
`overtimeApprovals`, `appConfig/overtimeCoordinatorEmails`, `mail_logs`.

Hay una regla de lectura por `collectionGroup("fotos")`.

---

## 9. Reglas generales de seguridad

- Toda operación requiere estar autenticado (`request.auth != null`).
- `isAdminRequester()` → `role in ['administrativo','dev']` tiene acceso amplio.
- `hasPerm('clave')` valida `profiles/{uid}.permisos[clave] == true`.
- `sameTenantCompanyData(data)` exige coincidencia de `tenantId` **y** `company`
  entre el documento y el perfil del solicitante.
- Caso especial mantenimiento: admin/dev **o** `permisos.mantenimiento`.
- Checklists diarias: `operativo` o `permisos.saludOcupacional`.
- Nunca confiar en scope enviado por el cliente: las Cloud Functions releen
  `profiles/{uid}` en el servidor y revalidan tenant/company.

---

## 10. Cloud Functions disponibles (`functions/index.js`, región `us-central1`)

- **`sendEquipoQrLabel`** — Genera un PNG QR de un equipo y lo envía por correo
  (Gmail SMTP). Revalida perfil + tenant/company contra `equipos/{id}` y exige
  permiso de mantenimiento.
- **`getOvertimeRecords`** — Lee la vista de asistencia (SQL Server / Bit2),
  calcula horas extra (entre semana vs fin de semana) y aplica restricción por
  coordinador (rol `dev` ve todo).
- **`decideOvertimeRecord`** — Aprueba/rechaza un registro de horas extra
  (`overtimeApprovals`).
- **`getOvertimeCoordinators`** — Lista coordinadores distintos + su email
  configurado.
- **`saveCoordinatorEmails`** — Guarda el mapeo coordinador → email en
  `appConfig/overtimeCoordinatorEmails`.
- **`testSqlConnection`** — Utilidad de diagnóstico de conexión SQL.

> Nota: las credenciales (SMTP, SQL, claves Firebase) viven en variables de
> entorno / `functions/.env` y **no** forman parte de esta base de conocimiento.

---

## 11. Preguntas frecuentes sugeridas (seeds)

- ¿Cómo uso las áreas de trabajo?
- ¿Qué puedo hacer en Mantenimiento?
- ¿Dónde veo los reportes / métricas?
- ¿Cómo genero un visado?
- ¿Dónde reviso las aperturas finalizadas?
- ¿Cómo se aprueban las horas extra?
- ¿Cómo registro o consulto una tarima?
- ¿Qué significa mi rol y mis permisos?
- ¿Por qué solo veo el área EPA? (usuario `epaAdmin`)
- ¿Cómo cambio mi región/tenant? (`/config-region`)

---

## 12. Limitaciones del asistente

- **No inventa datos operativos en tiempo real.** Mientras no esté conectado a
  fuentes en vivo (Firestore/n8n), responde solo sobre funcionamiento, módulos,
  rutas y procesos generales.
- No expone secretos ni credenciales.
- No responde con datos de otro `tenantId`/`company`.
- Si no tiene información suficiente, debe decirlo claramente y, si aplica,
  sugerir a qué módulo o ruta ir.
- Distingue siempre entre **documentación general** (este conocimiento) y
  **datos en vivo** (no disponibles aún).
