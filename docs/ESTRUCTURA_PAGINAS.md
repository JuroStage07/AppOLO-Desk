# Estructura de páginas — AppoloDesk

Clasificación de cada página bajo `src/pages/` en tres niveles:

- **Módulo** — área principal de nivel superior; aparece como tarjeta en el hub `/areas` (`AreasTrabajoHubPage.jsx`).
- **Submódulo** — página "hub" dentro de un módulo: renderiza un `ModuleGrid` con tarjetas hacia sus features. Aparece como sub-item en el sidebar.
- **Feature** — página hoja con una función concreta (lista, detalle, formulario, dashboard, métricas).

> El patrón que distingue un **submódulo** de un **feature**: el submódulo presenta opciones hijas con `ModuleGrid`/`ModuleCard`; el feature ejecuta la operación final.

`AreasTrabajoHubPage.jsx` queda **fuera del esquema** (es el contenedor/hub de navegación).

---

## Jerarquía

### Despacho — Módulo
`Despacho/Despacho.jsx` · `/despacho`
- **Feature** `Despacho/DespachoInProgressPage.jsx` · `/despacho/in-progress`
- **Feature** `Despacho/DespachoFinalizadosPage.jsx` · `/despacho/finalizados`

### Salud Ocupacional — Módulo
`Salud Ocupacional/SaludOcupacional.jsx` · `/salud`
- **Feature** `Salud Ocupacional/ControlMarcas/ControlMarcas.jsx` · `/salud/control-marcas`
- **Feature** `Salud Ocupacional/ControlMarcas/HistorialMarcas.jsx` · `/salud/control-marcas/historial`
- **Feature** `Salud Ocupacional/MetricaSaludOcupacional.jsx` · `/salud/metricas`
- **Feature** `Documentacion/DocumentacionPage.jsx` · `/documentacion` _(se muestra en el submenú de Salud, pero es ruta independiente)_
- **Submódulo** `Salud Ocupacional/Aperturas/AdministrarAperturas.jsx` · `/salud/aperturas`
  - **Feature** `Salud Ocupacional/Aperturas/AperturasFinalizadas.jsx` · `/salud/aperturas/finalizadas`
  - **Feature** `Salud Ocupacional/Aperturas/AperturaDetalle.jsx` · `/salud/aperturas/detalle/:id`
  - **Feature** `Salud Ocupacional/Aperturas/AperturasRechazdas.jsx` · `/salud/aperturas/rechazadas`
- **Submódulo** `Salud Ocupacional/Visados/Visados.jsx` · `/salud/visado`
  - **Feature** `Salud Ocupacional/Visados/NuevoVisado.jsx` · `/salud/visado/generar`
  - **Feature** `Salud Ocupacional/Visados/AdministrarVisados.jsx` · `/salud/visados`

### Recepción — Módulo
`Recepcion/Recepcion.jsx` · `/recepcion`
- **Feature** `Recepcion/AccionDescarga/AccionDescarga.jsx` · `/recepcion/accion-descarga`
- **Feature** `Recepcion/AccionDescarga/AccionDetalle.jsx` · `/recepcion/accion-descarga/:accionId`
- **Feature** `Recepcion/MetricaRecepcion.jsx` · `/recepcion/metricas`

### Mantenimiento — Módulo
`Mantenimiento/Mantenimiento.jsx` · `/mantenimiento`
- **Feature** `Mantenimiento/Equipos/PanelEquiposMantenimiento.jsx` · `/mantenimiento/equipos`
- **Feature** `Mantenimiento/Equipos/EquipoInfoPage.jsx` · `/mantenimiento/equipos/:id`
- **Submódulo** `Mantenimiento/OTs/OTsHubMantenimiento.jsx` · `/mantenimiento/ots`
  - **Feature** `Mantenimiento/OTs/OTsPage.jsx` · `/mantenimiento/OTsPage` _(tablero de gestión)_
  - **Feature** `Mantenimiento/OTs/OTsFinalizadasPage.jsx` · `/mantenimiento/ots/finalizadas`
  - **Feature** `Mantenimiento/OTs/OTsDashboardPage.jsx` · `/mantenimiento/ots/dashboard`
  - **Feature** `Mantenimiento/OTs/OTsSolDetallePage.jsx` · `/mantenimiento/ots-solicitud/:id`

### Servicios Generales — Módulo
`ServiciosGenerales/ServiciosGenerales.jsx` · `/servicios-generales`
- **Feature** `ServiciosGenerales/ValidarIngreso.jsx` · `/servicios-generales/validar-ingreso`
- **Submódulo** `ServiciosGenerales/ServiciosGeneralesOrdenesTrabajo.jsx` · `/servicios-generales/ordenes-trabajo`
  - **Feature** `ServiciosGenerales/ServiciosGeneralesOTCrear.jsx` · `/servicios-generales/ordenes-trabajo/crear`
  - **Feature** `ServiciosGenerales/ServiciosGeneralesOTGestion.jsx` · `/servicios-generales/ordenes-trabajo/gestion`
- **Submódulo** `Zona Franca/PesajeTarimas.jsx` · `/servicios-generales/pesaje-tarimas` _(atajo: `/pesado`)_
  - **Feature** `Zona Franca/RegistrarTarimas.jsx` · `/servicios-generales/pesaje-tarimas/registrar`
  - **Feature** `Zona Franca/ConsultarTarimas.jsx` · `/servicios-generales/pesaje-tarimas/consultar`

### EPA — Módulo
`EPA/EPAHubPage.jsx` · `/epa`
- **Feature** `EPA/AperturasFinalizadasEPA.jsx` · `/epa/aperturas-finalizadas`

---

## Páginas utilitarias / sistema (fuera del esquema)

| Página | Ruta | Rol |
|---|---|---|
| `AreasTrabajoHubPage.jsx` | `/`, `/areas` | Hub de navegación (contenedor) |
| `Home.jsx` | `/welcome` | Pantalla de bienvenida post-login |
| `Login.jsx` | `/login` | Autenticación |
| `ConfigRegionPage.jsx` | `/config-region` | Setup de tenant/región |

No clasificados por no ser rutas: `Mantenimiento/OTs/NewOTModal.jsx` (modal) y los archivos de `Mantenimiento/OTs/dashboard/*.js` (utilidades).

---

## Resumen por categoría

- **Módulos (6):** Despacho, Salud Ocupacional, Recepción, Mantenimiento, Servicios Generales, EPA.
- **Submódulos (5):** Aperturas, Visados, OTs, Órdenes de Trabajo (SG), Pesaje Tarimas.
- **Features (26):** ver jerarquía arriba.
- **Utilitarias (4):** AreasTrabajoHubPage, Home, Login, ConfigRegionPage.
