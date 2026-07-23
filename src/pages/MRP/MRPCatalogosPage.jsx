// MRP Tarimas — Catálogos: artículos, insumos, BOM y almacenes.
//
// Insumos y BOM se fijan solo por tenant/company (no dependen del almacén de
// trabajo). Un BOM (Bill of Materials) consume artículos insumo del catálogo
// `Insumos`. Los almacenes se crean con el tenant/company del usuario logeado.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  Warehouse,
  Box,
  FlaskConical,
  X,
  Pencil,
  Trash2,
  Power,
  Ellipsis,
  Layers,
  Users,
  Store,
} from "lucide-react";
import {
  Badge,
  Card,
  Field,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  Sheet,
  Chip,
  ChipsRow,
  StatusPill,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
  useConfirm,
} from "../../components/ui";
import {
  usePalletWarehouses,
  usePalletArticulos,
  usePalletClientes,
  usePalletTiendas,
  useMrpInsumos,
  useMrpBoms,
  useMrpWorkspace,
  useMrpUser,
} from "../../hooks/mrp";
import {
  SLATE,
  TEXT,
  DANGER,
  DANGER_BG,
  BORDER,
  SURFACE,
  SURFACE_INSET,
  SHADOW_BTN,
  SHADOW_CARD_HOVER,
  RADIUS_MD,
  RADIUS_LG,
  FS_XS,
  FS_SM,
  FS_BASE,
  FW_BOLD,
  FW_EXTRABOLD,
} from "../../styles/theme";
import { NoWarehouse } from "./components/WorkspaceBar";
import MrpDataTable from "./components/MrpDataTable";
import { CodeText, Dash } from "./components/mrpUi";
import useIsMobile from "../../hooks/useIsMobile";

// NOTA DE TERMINOLOGÍA (importante): la capa de datos conserva nombres legados
// distintos de las etiquetas de UI:
//   • "Compañías" (companias)  → tabla pallet_clientes / hook usePalletClientes
//     (código CL####). Es a lo que se asignan los artículos (EPA, Cofersa…).
//   • "Clientes"  (clientes)   → tabla pallet_tiendas   / hook usePalletTiendas
//     (código TD####). Es el destino al trasladar stock a la ubicación `tienda`.
// Se mantienen los identificadores de datos para no requerir migraciones; las
// etiquetas visibles usan la terminología nueva.
const TABS = [
  { key: "articulos", label: "Artículos", icon: Box },
  { key: "companias", label: "Compañías", icon: Users },
  { key: "clientes", label: "Clientes", icon: Store },
  { key: "insumos", label: "Insumos", icon: FlaskConical },
  { key: "bom", label: "BOM", icon: Layers },
  { key: "almacenes", label: "Almacenes", icon: Warehouse },
];

const CATALOG_BASE = "/mrp-tarimas/catalogos";

const PRICE_MODE_LABELS = { unit: "Por unidad", batch: "Por lote" };

function fmtPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function MRPCatalogosPage() {
  // La pestaña activa se toma de la URL (/mrp-tarimas/catalogos/:tab) para que
  // el submenú lateral pueda enlazar directo a cada catálogo.
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam : "articulos";
  const goTab = (key) => navigate(`${CATALOG_BASE}/${key}`);

  return (
    <>
      <SectionTitle
        title="Catálogos"
        action={<Badge tone="accent">Configuración</Badge>}
      />

      {/* Los chips sólo se muestran en móvil: en escritorio la navegación entre
          catálogos vive en el submenú lateral (acordeón "Catálogos"), por lo que
          aquí serían redundantes. */}
      {isMobile ? (
        <ChipsRow>
          {TABS.map((t) => (
            <Chip key={t.key} active={tab === t.key} onClick={() => goTab(t.key)}>
              {t.label}
            </Chip>
          ))}
        </ChipsRow>
      ) : null}

      {tab === "articulos" && <ArticulosTab />}
      {tab === "companias" && <CompaniasTab />}
      {tab === "clientes" && <ClientesTab />}
      {tab === "insumos" && <InsumosTab />}
      {tab === "bom" && <BomTab />}
      {tab === "almacenes" && <AlmacenesTab />}
    </>
  );
}

function ActiveCell({ active }) {
  return (
    <StatusPill tone={active ? "ok" : "neutral"}>
      {active ? "Activa" : "Inactiva"}
    </StatusPill>
  );
}

/* ---------------------------------------------------------- RowActionsMenu */
// Botón compacto (⋯) con popover flotante de acciones por fila. Se renderiza
// vía portal con posición fija para no quedar recortado por el overflow del
// contenedor de tabla. Cierra al elegir una acción, al hacer clic fuera y con
// Escape. `open` lo controla la sección (un solo menú abierto a la vez).
//
//   items: [{ label, icon, danger?, onClick }]
function RowActionsMenu({ open, onToggle, onClose, items }) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 8, right: window.innerWidth - r.right });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onReflow = () => onClose();
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        style={menuTrigger}
      >
        <Ellipsis size={18} strokeWidth={2.2} />
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ ...menuPopover, top: coords.top, right: coords.right }}
            >
              <span style={menuArrow} />
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onClose();
                    it.onClick();
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = it.danger
                      ? DANGER_BG
                      : SURFACE_INSET;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                  style={{ ...menuItem, ...(it.danger ? { color: DANGER } : {}) }}
                >
                  {it.icon ? <it.icon size={15} strokeWidth={2.2} /> : null}
                  {it.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/* ------------------------------------------------------------- Artículos */
// Cada artículo se asigna a UNA compañía. Al crear, se pueden seleccionar varias
// compañías: se crea una fila por compañía (código correlativo distinto). Los
// artículos antiguos sin compañía los puede asignar el rol `dev` desde la fila.
// (Capa de datos legada: "compañía" == pallet_clientes / usePalletClientes.)
function ClienteCell({ cliente }) {
  if (!cliente) return <Dash />;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontWeight: FW_BOLD }}>{cliente.nombre}</span>
      <span style={{ fontFamily: "monospace", fontSize: FS_XS, color: SLATE }}>
        {cliente.codigo}
      </span>
    </span>
  );
}

function ArticulosTab() {
  const { warehouseId } = useMrpWorkspace();
  const { profile } = useMrpUser();
  const isDev = String(profile?.role || "").toLowerCase() === "dev";
  const confirm = useConfirm();

  const {
    articulos,
    loading,
    error,
    refetch,
    createForClientes,
    creating,
    update,
    updating,
    remove,
    setActive,
    setCliente,
    peekNextCode,
  } = usePalletArticulos({ includeInactive: true, warehouseId });
  // Clientes activos disponibles para asignar.
  const { clientes, loading: loadingClientes } = usePalletClientes({
    includeInactive: false,
  });

  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [selClientes, setSelClientes] = useState([]); // ids seleccionados
  const [nextCode, setNextCode] = useState("");
  const [errs, setErrs] = useState({});

  // Asignación de cliente a un artículo existente (solo dev).
  const [assign, setAssign] = useState(null); // artículo en asignación o null
  const [assignId, setAssignId] = useState(""); // cliente elegido en el modal

  // Edición (nombre) y menú de acciones por fila.
  const [editing, setEditing] = useState(null); // artículo en edición o null
  const [editNombre, setEditNombre] = useState("");
  const [editErr, setEditErr] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);

  // Previsualiza los códigos correlativos que se asignarán (uno por cliente).
  const previewCodes = useMemo(() => {
    const m = /^A(\d+)$/.exec(nextCode || "");
    if (!m || selClientes.length === 0) return [];
    const start = parseInt(m[1], 10);
    const width = m[1].length;
    return selClientes.map((_, i) =>
      "A" + String(start + i).padStart(width, "0")
    );
  }, [nextCode, selClientes]);

  if (!warehouseId) return <NoWarehouse />;

  const openCreate = async () => {
    setNombre("");
    setSelClientes([]);
    setErrs({});
    setNextCode("");
    setOpen(true);
    try {
      setNextCode(await peekNextCode());
    } catch {
      /* si falla la previsualización, el código igual se asigna al guardar */
    }
  };

  const toggleCliente = (id) =>
    setSelClientes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const onCreate = async () => {
    const e = {};
    if (!nombre.trim()) e.nombre = "El nombre es obligatorio.";
    if (selClientes.length === 0)
      e.clientes = "Seleccione al menos una compañía.";
    setErrs(e);
    if (Object.keys(e).length) return;
    try {
      await createForClientes({ nombre, warehouseId, clienteIds: selClientes });
      setOpen(false);
    } catch {
      /* toast del hook */
    }
  };

  const onAssign = async () => {
    if (!assign || !assignId) return;
    try {
      await setCliente(assign.id, assignId);
      setAssign(null);
      setAssignId("");
    } catch {
      /* toast del hook */
    }
  };

  const openEdit = (a) => {
    setEditing(a);
    setEditNombre(a.nombre || "");
    setEditErr("");
  };

  const onEdit = async () => {
    if (!editing) return;
    if (!editNombre.trim()) {
      setEditErr("El nombre es obligatorio.");
      return;
    }
    try {
      await update(editing.id, { nombre: editNombre });
      setEditing(null);
      setEditNombre("");
      setEditErr("");
    } catch {
      /* toast del hook */
    }
  };

  const onDelete = async (a) => {
    const ok = await confirm({
      title: "Eliminar artículo",
      message: `¿Eliminar el artículo "${a.codigo} · ${a.nombre}"? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove(a.id);
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Artículos del almacén"
        action={
          <PrimaryButton icon={Plus} onClick={openCreate}>
            Nuevo artículo
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando artículos…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : articulos.length === 0 ? (
        <EmptyState
          icon={Box}
          title="Sin artículos"
          description="Crea el primer artículo de este almacén."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={[
              {
                key: "codigo",
                title: "Código",
                get: (a) => ({ value: a.codigo || "—", label: a.codigo || "—" }),
                render: (a) => (
                  <CodeText>{a.codigo}</CodeText>
                ),
              },
              {
                key: "nombre",
                title: "Nombre",
                get: (a) => ({ value: a.nombre || "—", label: a.nombre || "—" }),
                render: (a) => a.nombre,
              },
              {
                key: "compania",
                title: "Compañía",
                get: (a) => ({
                  value: a.cliente?.nombre || "—",
                  label: a.cliente?.nombre || "—",
                }),
                render: (a) =>
                  a.cliente ? (
                    <ClienteCell cliente={a.cliente} />
                  ) : isDev ? (
                    <GhostButton
                      size="sm"
                      icon={Users}
                      onClick={() => {
                        setAssign(a);
                        setAssignId("");
                      }}
                    >
                      Asignar compañía
                    </GhostButton>
                  ) : (
                    <Dash />
                  ),
              },
              {
                key: "estado",
                title: "Estado",
                get: (a) => ({
                  value: a.active ? "Activa" : "Inactiva",
                  label: a.active ? "Activa" : "Inactiva",
                }),
                render: (a) => <ActiveCell active={a.active} />,
              },
            ]}
            rows={articulos}
            rowKey={(a) => a.id}
            storageKey="appolo_mrp_cat_articulos_cols"
            pageSize={5}
            minWidth={720}
            renderActions={(a) => (
              <RowActionsMenu
                open={openMenuId === a.id}
                onToggle={() =>
                  setOpenMenuId((cur) => (cur === a.id ? null : a.id))
                }
                onClose={() => setOpenMenuId(null)}
                items={[
                  { label: "Editar", icon: Pencil, onClick: () => openEdit(a) },
                  {
                    label: a.active ? "Desactivar" : "Activar",
                    icon: Power,
                    onClick: () => setActive(a.id, !a.active),
                  },
                  {
                    label: "Eliminar",
                    icon: Trash2,
                    danger: true,
                    onClick: () => onDelete(a),
                  },
                ]}
              />
            )}
          />
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo artículo"
        maxWidth={480}
      >
        <Sheet.Body>
          <Field
            label="Código"
            hint={
              previewCodes.length > 1
                ? `Se crearán ${previewCodes.length} artículos: ${previewCodes.join(", ")}`
                : "Se asigna automáticamente al guardar."
            }
          >
            <Field.Input
              value={previewCodes[0] || nextCode || "Calculando…"}
              disabled
              readOnly
            />
          </Field>
          <Field label="Nombre del artículo" required error={errs.nombre}>
            <Field.Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Tarima triple"
              autoFocus
            />
          </Field>
          <Field
            label="Compañías"
            required
            error={errs.clientes}
            hint={
              loadingClientes
                ? "Cargando compañías…"
                : clientes.length === 0
                ? "No hay compañías activas. Créalas en la pestaña Compañías."
                : "Selecciona una o más. Se crea un artículo por compañía."
            }
          >
            {clientes.length > 0 ? (
              <ChipsRow>
                {clientes.map((c) => (
                  <Chip
                    key={c.id}
                    active={selClientes.includes(c.id)}
                    onClick={() => toggleCliente(c.id)}
                  >
                    {c.nombre}
                  </Chip>
                ))}
              </ChipsRow>
            ) : null}
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setOpen(false)} disabled={creating}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onCreate} loading={creating}>
            Crear
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Asignar compañía a un artículo existente (solo dev). */}
      <Sheet
        open={!!assign}
        onClose={() => setAssign(null)}
        title="Asignar compañía"
        maxWidth={440}
      >
        <Sheet.Body>
          <Field label="Artículo">
            <Field.Input
              value={assign ? `${assign.codigo} — ${assign.nombre}` : ""}
              disabled
              readOnly
            />
          </Field>
          <Field
            label="Compañía"
            required
            hint={
              clientes.length === 0
                ? "No hay compañías activas. Créalas en la pestaña Compañías."
                : undefined
            }
          >
            <Field.Select
              value={assignId}
              disabled={loadingClientes || clientes.length === 0}
              onChange={(e) => setAssignId(e.target.value)}
            >
              <option value="">Seleccione una compañía…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </Field.Select>
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setAssign(null)}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={onAssign} disabled={!assignId}>
            Asignar
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Editar artículo (nombre). El código y la compañía no se editan aquí. */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar artículo"
        maxWidth={460}
      >
        <Sheet.Body>
          <Field label="Código" hint="El código no se puede editar.">
            <Field.Input value={editing?.codigo || ""} disabled readOnly />
          </Field>
          <Field label="Nombre del artículo" required error={editErr}>
            <Field.Input
              value={editNombre}
              onChange={(e) => setEditNombre(e.target.value)}
              placeholder="Ej: Tarima triple"
              autoFocus
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setEditing(null)} disabled={updating}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onEdit} loading={updating}>
            Guardar cambios
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------- Compañías */
// La pestaña "Compañías" administra el catálogo de compañías (a las que se
// asignan los artículos: EPA, Cofersa…). No requiere almacén; se fija solo por
// tenant/company. El código (CL####) se autogenera.
// (Capa de datos legada: pallet_clientes / usePalletClientes.)
function CompaniasTab() {
  const confirm = useConfirm();
  const {
    clientes,
    loading,
    error,
    refetch,
    create,
    creating,
    update,
    updating,
    remove,
    setActive,
    peekNextCode,
  } = usePalletClientes({ includeInactive: true });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [nextCode, setNextCode] = useState("");
  const [err, setErr] = useState("");

  const openCreate = async () => {
    setEditing(null);
    setNombre("");
    setErr("");
    setNextCode("");
    setOpen(true);
    try {
      setNextCode(await peekNextCode());
    } catch {
      /* si falla la previsualización, el código igual se asigna al guardar */
    }
  };

  const openEdit = (c) => {
    setEditing(c);
    setNombre(c.nombre || "");
    setErr("");
    setNextCode("");
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!nombre.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }
    try {
      if (editing) {
        await update(editing.id, { nombre });
      } else {
        await create({ nombre });
      }
      setOpen(false);
      setEditing(null);
      setNombre("");
      setErr("");
    } catch {
      /* toast del hook */
    }
  };

  const onDelete = async (c) => {
    const ok = await confirm({
      title: "Eliminar compañía",
      message: `¿Eliminar la compañía "${c.codigo} · ${c.nombre}"? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove(c.id);
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Compañías"
        action={
          <PrimaryButton icon={Plus} onClick={openCreate}>
            Nueva compañía
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando compañías…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : clientes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin compañías"
          description="Crea la primera compañía."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={[
              {
                key: "codigo",
                title: "Código",
                get: (c) => ({ value: c.codigo || "—", label: c.codigo || "—" }),
                render: (c) => (
                  <CodeText>{c.codigo}</CodeText>
                ),
              },
              {
                key: "nombre",
                title: "Nombre",
                get: (c) => ({ value: c.nombre || "—", label: c.nombre || "—" }),
                render: (c) => c.nombre,
              },
              {
                key: "estado",
                title: "Estado",
                get: (c) => ({
                  value: c.active ? "Activa" : "Inactiva",
                  label: c.active ? "Activa" : "Inactiva",
                }),
                render: (c) => <ActiveCell active={c.active} />,
              },
            ]}
            rows={clientes}
            rowKey={(c) => c.id}
            storageKey="appolo_mrp_cat_companias_cols"
            pageSize={5}
            minWidth={480}
            renderActions={(c) => (
              <RowActionsMenu
                open={openMenuId === c.id}
                onToggle={() =>
                  setOpenMenuId((cur) => (cur === c.id ? null : c.id))
                }
                onClose={() => setOpenMenuId(null)}
                items={[
                  { label: "Editar", icon: Pencil, onClick: () => openEdit(c) },
                  {
                    label: c.active ? "Desactivar" : "Activar",
                    icon: Power,
                    onClick: () => setActive(c.id, !c.active),
                  },
                  {
                    label: "Eliminar",
                    icon: Trash2,
                    danger: true,
                    onClick: () => onDelete(c),
                  },
                ]}
              />
            )}
          />
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar compañía" : "Nueva compañía"}
        maxWidth={460}
      >
        <Sheet.Body>
          <Field
            label="Código"
            hint={
              editing
                ? "El código no se puede editar."
                : "Se asigna automáticamente al guardar."
            }
          >
            <Field.Input
              value={editing ? editing.codigo : nextCode || "Calculando…"}
              disabled
              readOnly
            />
          </Field>
          <Field label="Nombre de la compañía" required error={err}>
            <Field.Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: EPA"
              autoFocus
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton
            onClick={() => setOpen(false)}
            disabled={creating || updating}
          >
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onSubmit} loading={editing ? updating : creating}>
            {editing ? "Guardar cambios" : "Crear"}
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------------- Clientes */
// La pestaña "Clientes" administra el catálogo de clientes (destino al trasladar
// stock a la ubicación `tienda`). No requiere almacén; se fija solo por
// tenant/company. El código (TD####) se autogenera. Editar/eliminar: solo `dev`.
// Cada cliente se vincula a UNA compañía (misma lógica que Artículos): al crear
// se pueden seleccionar varias compañías → una fila por compañía; el rol `dev`
// asigna la compañía a los clientes antiguos que no la tengan.
// (Capa de datos legada: pallet_tiendas / usePalletTiendas; compania = pallet_clientes.)
function ClientesTab() {
  const { profile } = useMrpUser();
  const isDev = String(profile?.role || "").toLowerCase() === "dev";
  const confirm = useConfirm();
  const {
    tiendas,
    loading,
    error,
    refetch,
    createForCompanias,
    creating,
    update,
    updating,
    remove,
    setActive,
    setCompania,
    peekNextCode,
  } = usePalletTiendas({ includeInactive: true });
  // Compañías activas disponibles para vincular.
  const { clientes: companias, loading: loadingCompanias } = usePalletClientes({
    includeInactive: false,
  });

  const [open, setOpen] = useState(false); // sheet de creación
  const [openMenuId, setOpenMenuId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [selCompanias, setSelCompanias] = useState([]); // ids seleccionados
  const [nextCode, setNextCode] = useState("");
  const [errs, setErrs] = useState({});

  // Edición (nombre, solo dev).
  const [editing, setEditing] = useState(null);
  const [editNombre, setEditNombre] = useState("");
  const [editErr, setEditErr] = useState("");

  // Asignación de compañía a un cliente existente (solo dev).
  const [assign, setAssign] = useState(null);
  const [assignId, setAssignId] = useState("");

  // Previsualiza los códigos correlativos que se asignarán (uno por compañía).
  const previewCodes = useMemo(() => {
    const m = /^TD(\d+)$/.exec(nextCode || "");
    if (!m || selCompanias.length === 0) return [];
    const start = parseInt(m[1], 10);
    const width = m[1].length;
    return selCompanias.map((_, i) =>
      "TD" + String(start + i).padStart(width, "0")
    );
  }, [nextCode, selCompanias]);

  const openCreate = async () => {
    setNombre("");
    setSelCompanias([]);
    setErrs({});
    setNextCode("");
    setOpen(true);
    try {
      setNextCode(await peekNextCode());
    } catch {
      /* si falla la previsualización, el código igual se asigna al guardar */
    }
  };

  const toggleCompania = (id) =>
    setSelCompanias((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const onCreate = async () => {
    const e = {};
    if (!nombre.trim()) e.nombre = "El nombre es obligatorio.";
    if (selCompanias.length === 0)
      e.companias = "Seleccione al menos una compañía.";
    setErrs(e);
    if (Object.keys(e).length) return;
    try {
      await createForCompanias({ nombre, companiaIds: selCompanias });
      setOpen(false);
    } catch {
      /* toast del hook */
    }
  };

  const openEdit = (t) => {
    setEditing(t);
    setEditNombre(t.nombre || "");
    setEditErr("");
  };

  const onEdit = async () => {
    if (!editing) return;
    if (!editNombre.trim()) {
      setEditErr("El nombre es obligatorio.");
      return;
    }
    try {
      await update(editing.id, { nombre: editNombre });
      setEditing(null);
      setEditNombre("");
      setEditErr("");
    } catch {
      /* toast del hook */
    }
  };

  const onAssign = async () => {
    if (!assign || !assignId) return;
    try {
      await setCompania(assign.id, assignId);
      setAssign(null);
      setAssignId("");
    } catch {
      /* toast del hook */
    }
  };

  const onDelete = async (t) => {
    const ok = await confirm({
      title: "Eliminar cliente",
      message: `¿Eliminar el cliente "${t.codigo} · ${t.nombre}"? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove(t.id);
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Clientes"
        action={
          <PrimaryButton icon={Plus} onClick={openCreate}>
            Nuevo cliente
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando clientes…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : tiendas.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin clientes"
          description="Crea el primer cliente."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={[
              {
                key: "codigo",
                title: "Código",
                get: (t) => ({ value: t.codigo || "—", label: t.codigo || "—" }),
                render: (t) => (
                  <CodeText>{t.codigo}</CodeText>
                ),
              },
              {
                key: "nombre",
                title: "Nombre",
                get: (t) => ({ value: t.nombre || "—", label: t.nombre || "—" }),
                render: (t) => t.nombre,
              },
              {
                key: "compania",
                title: "Compañía",
                get: (t) => ({
                  value: t.compania?.nombre || "—",
                  label: t.compania?.nombre || "—",
                }),
                render: (t) =>
                  t.compania ? (
                    <ClienteCell cliente={t.compania} />
                  ) : isDev ? (
                    <GhostButton
                      size="sm"
                      icon={Users}
                      onClick={() => {
                        setAssign(t);
                        setAssignId("");
                      }}
                    >
                      Asignar compañía
                    </GhostButton>
                  ) : (
                    <Dash />
                  ),
              },
              {
                key: "estado",
                title: "Estado",
                get: (t) => ({
                  value: t.active ? "Activa" : "Inactiva",
                  label: t.active ? "Activa" : "Inactiva",
                }),
                render: (t) => <ActiveCell active={t.active} />,
              },
            ]}
            rows={tiendas}
            rowKey={(t) => t.id}
            storageKey="appolo_mrp_cat_clientes_cols"
            pageSize={5}
            minWidth={640}
            actionsLabel={isDev ? "Acciones" : "Acción"}
            renderActions={(t) =>
              isDev ? (
                <RowActionsMenu
                  open={openMenuId === t.id}
                  onToggle={() =>
                    setOpenMenuId((cur) => (cur === t.id ? null : t.id))
                  }
                  onClose={() => setOpenMenuId(null)}
                  items={[
                    { label: "Editar", icon: Pencil, onClick: () => openEdit(t) },
                    {
                      label: t.active ? "Desactivar" : "Activar",
                      icon: Power,
                      onClick: () => setActive(t.id, !t.active),
                    },
                    {
                      label: "Eliminar",
                      icon: Trash2,
                      danger: true,
                      onClick: () => onDelete(t),
                    },
                  ]}
                />
              ) : (
                <GhostButton size="sm" onClick={() => setActive(t.id, !t.active)}>
                  {t.active ? "Desactivar" : "Activar"}
                </GhostButton>
              )
            }
          />
        </Card>
      )}

      {/* Crear cliente(s): uno por compañía seleccionada. */}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo cliente"
        maxWidth={480}
      >
        <Sheet.Body>
          <Field
            label="Código"
            hint={
              previewCodes.length > 1
                ? `Se crearán ${previewCodes.length} clientes: ${previewCodes.join(", ")}`
                : "Se asigna automáticamente al guardar."
            }
          >
            <Field.Input
              value={previewCodes[0] || nextCode || "Calculando…"}
              disabled
              readOnly
            />
          </Field>
          <Field label="Nombre del cliente" required error={errs.nombre}>
            <Field.Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Tienda Central"
              autoFocus
            />
          </Field>
          <Field
            label="Compañías"
            required
            error={errs.companias}
            hint={
              loadingCompanias
                ? "Cargando compañías…"
                : companias.length === 0
                ? "No hay compañías activas. Créalas en la pestaña Compañías."
                : "Selecciona una o más. Se crea un cliente por compañía."
            }
          >
            {companias.length > 0 ? (
              <ChipsRow>
                {companias.map((c) => (
                  <Chip
                    key={c.id}
                    active={selCompanias.includes(c.id)}
                    onClick={() => toggleCompania(c.id)}
                  >
                    {c.nombre}
                  </Chip>
                ))}
              </ChipsRow>
            ) : null}
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setOpen(false)} disabled={creating}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onCreate} loading={creating}>
            Crear
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Editar cliente (nombre, solo dev). */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar cliente"
        maxWidth={460}
      >
        <Sheet.Body>
          <Field label="Código" hint="El código no se puede editar.">
            <Field.Input value={editing?.codigo || ""} disabled readOnly />
          </Field>
          <Field label="Nombre del cliente" required error={editErr}>
            <Field.Input
              value={editNombre}
              onChange={(e) => setEditNombre(e.target.value)}
              placeholder="Ej: Tienda Central"
              autoFocus
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setEditing(null)} disabled={updating}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onEdit} loading={updating}>
            Guardar cambios
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Asignar compañía a un cliente existente (solo dev). */}
      <Sheet
        open={!!assign}
        onClose={() => setAssign(null)}
        title="Asignar compañía"
        maxWidth={440}
      >
        <Sheet.Body>
          <Field label="Cliente">
            <Field.Input
              value={assign ? `${assign.codigo} — ${assign.nombre}` : ""}
              disabled
              readOnly
            />
          </Field>
          <Field
            label="Compañía"
            required
            hint={
              companias.length === 0
                ? "No hay compañías activas. Créalas en la pestaña Compañías."
                : undefined
            }
          >
            <Field.Select
              value={assignId}
              disabled={loadingCompanias || companias.length === 0}
              onChange={(e) => setAssignId(e.target.value)}
            >
              <option value="">Seleccione una compañía…</option>
              {companias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </Field.Select>
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setAssign(null)}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={onAssign} disabled={!assignId}>
            Asignar
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}

/* --------------------------------------------------------------- Insumos */
// La pestaña "Insumos" administra solo los artículos insumo. No requiere
// almacén; se fija solo por tenant/company.
function InsumosTab() {
  return <InsumosSection />;
}

/* ------------------------------------------------------------------- BOM */
// La pestaña "BOM" administra las composiciones de materiales (Bill of
// Materials) que consumen artículos insumo del catálogo "Insumos".
function BomTab() {
  return <BomSection />;
}

/* ------------------------------------------------- Insumos › Artículos insumo */
function InsumosSection() {
  const {
    insumos,
    loading,
    error,
    refetch,
    create,
    creating,
    update,
    updating,
    remove,
    setActive,
    peekNextCode,
  } = useMrpInsumos({ includeInactive: true });
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // insumo en edición o null
  const [openMenuId, setOpenMenuId] = useState(null); // fila con menú abierto
  const [form, setForm] = useState({
    nombre: "",
    detalle: "",
    price: "",
    stock: "",
  });
  const [porLote, setPorLote] = useState(false);
  const [nextCode, setNextCode] = useState("");
  const [errs, setErrs] = useState({});

  const openCreate = async () => {
    setEditing(null);
    setForm({ nombre: "", detalle: "", price: "", stock: "" });
    setPorLote(false);
    setErrs({});
    setNextCode("");
    setOpen(true);
    try {
      setNextCode(await peekNextCode());
    } catch {
      /* si falla la previsualización, el código igual se asigna al guardar */
    }
  };

  const openEdit = (i) => {
    setEditing(i);
    setForm({
      nombre: i.nombre || "",
      detalle: i.detalle || "",
      price: String(i.price ?? ""),
      stock: String(i.stock ?? 0),
    });
    setPorLote(i.price_mode === "batch");
    setErrs({});
    setNextCode("");
    setOpen(true);
  };

  const onSubmit = async () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es obligatorio.";
    const p = Number(form.price);
    if (form.price === "" || !Number.isFinite(p) || p < 0) {
      e.price = "Ingrese un precio mayor o igual a 0.";
    }
    const s = Number(form.stock);
    if (editing && (form.stock === "" || !Number.isInteger(s) || s < 0)) {
      e.stock = "Ingrese un stock entero mayor o igual a 0.";
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    try {
      if (editing) {
        await update(editing.id, {
          nombre: form.nombre,
          detalle: form.detalle,
          price: p,
          priceMode: porLote ? "batch" : "unit",
          stock: s,
        });
      } else {
        await create({
          nombre: form.nombre,
          detalle: form.detalle,
          price: p,
          priceMode: porLote ? "batch" : "unit",
        });
      }
      setOpen(false);
    } catch {
      /* toast del hook */
    }
  };

  const onDelete = async (i) => {
    const ok = await confirm({
      title: "Eliminar insumo",
      message: "¿Eliminar este insumo? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove(i.id);
    } catch {
      /* toast del hook */
    }
  };

  return (
    <div>
      <SectionTitle
        title="Artículos insumo"
        action={
          <PrimaryButton icon={Plus} onClick={openCreate}>
            Nuevo insumo
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando insumos…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : insumos.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="Sin insumos"
          description="Crea el primer artículo insumo."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={[
              {
                key: "codigo",
                title: "Código",
                get: (i) => ({ value: i.codigo || "—", label: i.codigo || "—" }),
                render: (i) => (
                  <CodeText>{i.codigo}</CodeText>
                ),
              },
              {
                key: "nombre",
                title: "Nombre",
                get: (i) => ({ value: i.nombre || "—", label: i.nombre || "—" }),
                render: (i) => i.nombre,
              },
              {
                key: "detalle",
                title: "Detalle",
                get: (i) => ({ value: i.detalle || "—", label: i.detalle || "—" }),
                render: (i) => i.detalle || "—",
              },
              {
                key: "precio",
                title: "Precio",
                align: "right",
                get: (i) => ({
                  value: String(i.price ?? ""),
                  label: fmtPrice(i.price),
                }),
                render: (i) => fmtPrice(i.price),
              },
              {
                key: "modo",
                title: "Modo",
                get: (i) => ({
                  value: i.price_mode || "—",
                  label: PRICE_MODE_LABELS[i.price_mode] || i.price_mode || "—",
                }),
                render: (i) => PRICE_MODE_LABELS[i.price_mode] || i.price_mode,
              },
              {
                key: "estado",
                title: "Estado",
                get: (i) => ({
                  value: i.active ? "Activo" : "Inactivo",
                  label: i.active ? "Activo" : "Inactivo",
                }),
                render: (i) => <ActiveCell active={i.active} />,
              },
            ]}
            rows={insumos}
            rowKey={(i) => i.id}
            storageKey="appolo_mrp_cat_insumos_cols"
            pageSize={5}
            minWidth={760}
            renderActions={(i) => (
              <RowActionsMenu
                open={openMenuId === i.id}
                onToggle={() =>
                  setOpenMenuId((cur) => (cur === i.id ? null : i.id))
                }
                onClose={() => setOpenMenuId(null)}
                items={[
                  { label: "Editar", icon: Pencil, onClick: () => openEdit(i) },
                  {
                    label: i.active ? "Desactivar" : "Activar",
                    icon: Power,
                    onClick: () => setActive(i.id, !i.active),
                  },
                  {
                    label: "Eliminar",
                    icon: Trash2,
                    danger: true,
                    onClick: () => onDelete(i),
                  },
                ]}
              />
            )}
          />
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar artículo insumo" : "Nuevo artículo insumo"}
        maxWidth={460}
      >
        <Sheet.Body>
          <Field
            label="Código"
            hint={
              editing
                ? "El código no se puede editar."
                : "Se asigna automáticamente al guardar."
            }
          >
            <Field.Input
              value={editing ? editing.codigo : nextCode || "Calculando…"}
              disabled
              readOnly
            />
          </Field>
          <Field label="Nombre" required error={errs.nombre}>
            <Field.Input
              value={form.nombre}
              onChange={(e) =>
                setForm((f) => ({ ...f, nombre: e.target.value }))
              }
              placeholder="Ej: Bolsa plástica"
              autoFocus
            />
          </Field>
          <Field label="Detalle (opcional)">
            <Field.Textarea
              value={form.detalle}
              onChange={(e) =>
                setForm((f) => ({ ...f, detalle: e.target.value }))
              }
              placeholder="Descripción del insumo…"
            />
          </Field>
          <Field label="Precio" required error={errs.price}>
            <Field.Input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) =>
                setForm((f) => ({ ...f, price: e.target.value }))
              }
              placeholder="0.00"
            />
          </Field>
          {editing ? (
            <Field label="Stock" required error={errs.stock}>
              <Field.Input
                type="number"
                min="0"
                step="1"
                value={form.stock}
                onChange={(e) =>
                  setForm((f) => ({ ...f, stock: e.target.value }))
                }
                placeholder="0"
              />
            </Field>
          ) : null}
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={porLote}
              onChange={(e) => setPorLote(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span>
              Precio por lote
              <span style={{ color: SLATE, fontWeight: FW_BOLD }}>
                {" "}
                — sin marcar, el precio es por unidad
              </span>
            </span>
          </label>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton
            onClick={() => setOpen(false)}
            disabled={creating || updating}
          >
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onSubmit} loading={editing ? updating : creating}>
            {editing ? "Guardar cambios" : "Crear"}
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------- BOM */
function BomSection() {
  const {
    boms,
    loading,
    error,
    refetch,
    create,
    creating,
    update,
    updating,
    remove,
    setActive,
    peekNextCode,
  } = useMrpBoms({ includeInactive: true });
  // Insumos activos disponibles para agregar a un BOM.
  const { insumos: activos, loading: loadingInsumos } = useMrpInsumos({
    includeInactive: false,
  });
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // BOM en edición o null
  const [openMenuId, setOpenMenuId] = useState(null); // fila con menú abierto
  const [nombre, setNombre] = useState("");
  // Cada item: insumo completo + `quantity` (string editable, se valida > 0).
  const [selected, setSelected] = useState([]);
  const [nextCode, setNextCode] = useState("");
  const [errs, setErrs] = useState({});

  const disponibles = useMemo(() => {
    const taken = new Set(selected.map((s) => s.id));
    return activos.filter((a) => !taken.has(a.id));
  }, [activos, selected]);

  const openCreate = async () => {
    setEditing(null);
    setNombre("");
    setSelected([]);
    setErrs({});
    setNextCode("");
    setOpen(true);
    try {
      setNextCode(await peekNextCode());
    } catch {
      /* si falla la previsualización, el código igual se asigna al guardar */
    }
  };

  const openEdit = (r) => {
    setEditing(r);
    setNombre(r.nombre || "");
    setSelected(
      (r.insumos || []).map((i) => ({
        ...i,
        quantity: String(i.quantity ?? 1),
      }))
    );
    setErrs({});
    setNextCode("");
    setOpen(true);
  };

  const addInsumo = (id) => {
    const found = activos.find((a) => a.id === id);
    if (found && !selected.some((s) => s.id === id)) {
      setSelected((prev) => [...prev, { ...found, quantity: "1" }]);
    }
  };

  const setQty = (id, value) =>
    setSelected((prev) =>
      prev.map((s) => (s.id === id ? { ...s, quantity: value } : s))
    );

  const removeInsumo = (id) =>
    setSelected((prev) => prev.filter((s) => s.id !== id));

  const onSubmit = async () => {
    const e = {};
    if (!nombre.trim()) e.nombre = "El nombre del BOM es obligatorio.";
    if (!selected.length) {
      e.insumos = "Agregue al menos un artículo insumo.";
    } else if (
      selected.some((s) => {
        const q = Number(s.quantity);
        return !Number.isInteger(q) || q <= 0;
      })
    ) {
      e.insumos = "Cada insumo debe tener una cantidad entera mayor a 0.";
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    const items = selected.map((s) => ({
      insumoId: s.id,
      quantity: Number(s.quantity),
    }));
    try {
      if (editing) {
        await update(editing.id, { nombre, items });
      } else {
        await create({ nombre, items });
      }
      setOpen(false);
    } catch {
      /* toast del hook */
    }
  };

  const onDelete = async (r) => {
    const ok = await confirm({
      title: "Eliminar BOM",
      message: "¿Eliminar este BOM? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove(r.id);
    } catch {
      /* toast del hook */
    }
  };

  return (
    <div>
      <SectionTitle
        title="BOM"
        action={
          <PrimaryButton icon={Plus} onClick={openCreate}>
            Nuevo BOM
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando BOM…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : boms.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Sin BOM"
          description="Crea el primer BOM."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={[
              {
                key: "codigo",
                title: "Código",
                get: (r) => ({ value: r.codigo || "—", label: r.codigo || "—" }),
                render: (r) => (
                  <CodeText>{r.codigo}</CodeText>
                ),
              },
              {
                key: "nombre",
                title: "Nombre",
                get: (r) => ({ value: r.nombre || "—", label: r.nombre || "—" }),
                render: (r) => r.nombre,
              },
              {
                key: "insumos",
                title: "Insumos",
                filterable: false,
                get: (r) => {
                  const v = (r.insumos || [])
                    .map((i) => `${i.nombre} x ${i.quantity ?? 1}`)
                    .join(", ");
                  return { value: v || "—", label: v || "—" };
                },
                render: (r) => {
                  const v = (r.insumos || [])
                    .map((i) => `${i.nombre} x ${i.quantity ?? 1}`)
                    .join(", ");
                  return v || "—";
                },
              },
              {
                key: "total",
                title: "Total",
                align: "right",
                get: (r) => ({
                  value: String((r.insumos || []).length),
                  label: String((r.insumos || []).length),
                }),
                render: (r) => (
                  <span style={{ fontWeight: FW_EXTRABOLD }}>
                    {(r.insumos || []).length}
                  </span>
                ),
              },
              {
                key: "estado",
                title: "Estado",
                get: (r) => ({
                  value: r.active ? "Activo" : "Inactivo",
                  label: r.active ? "Activo" : "Inactivo",
                }),
                render: (r) => <ActiveCell active={r.active} />,
              },
            ]}
            rows={boms}
            rowKey={(r) => r.id}
            storageKey="appolo_mrp_cat_bom_cols"
            pageSize={5}
            minWidth={700}
            renderActions={(r) => (
              <RowActionsMenu
                open={openMenuId === r.id}
                onToggle={() =>
                  setOpenMenuId((cur) => (cur === r.id ? null : r.id))
                }
                onClose={() => setOpenMenuId(null)}
                items={[
                  { label: "Editar", icon: Pencil, onClick: () => openEdit(r) },
                  {
                    label: r.active ? "Desactivar" : "Activar",
                    icon: Power,
                    onClick: () => setActive(r.id, !r.active),
                  },
                  {
                    label: "Eliminar",
                    icon: Trash2,
                    danger: true,
                    onClick: () => onDelete(r),
                  },
                ]}
              />
            )}
          />
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar BOM" : "Nuevo BOM"}
        maxWidth={520}
      >
        <Sheet.Body>
          <Field
            label="Código"
            hint={
              editing
                ? "El código no se puede editar."
                : "Se asigna automáticamente al guardar."
            }
          >
            <Field.Input
              value={editing ? editing.codigo : nextCode || "Calculando…"}
              disabled
              readOnly
            />
          </Field>
          <Field label="Nombre del BOM" required error={errs.nombre}>
            <Field.Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: BOM empaque estándar"
              autoFocus
            />
          </Field>

          <Field
            label="Agregar artículo insumo"
            error={errs.insumos}
            hint={
              loadingInsumos
                ? "Cargando insumos…"
                : disponibles.length === 0
                ? "No hay más insumos activos disponibles."
                : undefined
            }
          >
            <Field.Select
              value=""
              disabled={loadingInsumos || disponibles.length === 0}
              onChange={(e) => {
                if (e.target.value) addInsumo(e.target.value);
              }}
            >
              <option value="">Seleccione un insumo…</option>
              {disponibles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </Field.Select>
          </Field>

          {selected.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <span style={{ color: SLATE, fontWeight: FW_EXTRABOLD, fontSize: FS_SM }}>
                Insumos seleccionados ({selected.length})
              </span>
              <div style={{ display: "grid", gap: 6 }}>
                {selected.map((s) => (
                  <div key={s.id} style={selectedRow}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <CodeText>{s.codigo}</CodeText>{" "}
                      {s.nombre}
                    </span>
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span style={{ color: SLATE, fontWeight: FW_EXTRABOLD }}>x</span>
                      <Field.Input
                        type="number"
                        min="1"
                        step="1"
                        value={s.quantity}
                        onChange={(e) => setQty(s.id, e.target.value)}
                        style={{ width: 72, padding: "8px 10px" }}
                        aria-label={`Cantidad de ${s.nombre}`}
                      />
                    </span>
                    <GhostButton
                      size="sm"
                      icon={X}
                      onClick={() => removeInsumo(s.id)}
                    >
                      Quitar
                    </GhostButton>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton
            onClick={() => setOpen(false)}
            disabled={creating || updating}
          >
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onSubmit} loading={editing ? updating : creating}>
            {editing ? "Guardar cambios" : "Crear"}
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </div>
  );
}

const menuTrigger = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  borderRadius: RADIUS_MD,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: SLATE,
  cursor: "pointer",
  boxShadow: SHADOW_BTN,
  padding: 0,
};

const menuPopover = {
  position: "fixed",
  zIndex: 10000,
  minWidth: 176,
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_LG,
  boxShadow: SHADOW_CARD_HOVER,
  padding: 6,
  display: "grid",
  gap: 2,
};

// Puntita tipo "globo de diálogo" en la esquina superior derecha del popover.
const menuArrow = {
  position: "absolute",
  top: -6,
  right: 14,
  width: 12,
  height: 12,
  background: SURFACE,
  borderLeft: `1px solid ${BORDER}`,
  borderTop: `1px solid ${BORDER}`,
  transform: "rotate(45deg)",
  borderTopLeftRadius: 3,
};

const menuItem = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "9px 12px",
  borderRadius: RADIUS_MD,
  border: "none",
  background: "transparent",
  color: TEXT,
  fontWeight: FW_EXTRABOLD,
  fontSize: FS_SM,
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const checkboxRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: FW_EXTRABOLD,
  fontSize: FS_BASE,
  color: TEXT,
  cursor: "pointer",
};

const selectedRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 12px",
  borderRadius: RADIUS_MD,
  background: SURFACE_INSET,
  fontWeight: FW_EXTRABOLD,
  fontSize: FS_BASE,
  color: TEXT,
};

/* ------------------------------------------------------------ Almacenes */
function AlmacenesTab() {
  const confirm = useConfirm();
  const {
    warehouses,
    loading,
    error,
    refetch,
    create,
    creating,
    update,
    updating,
    remove,
    setActive,
  } = usePalletWarehouses({ includeInactive: true });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const [errs, setErrs] = useState({});

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "" });
    setErrs({});
    setOpen(true);
  };

  const openEdit = (w) => {
    setEditing(w);
    setForm({ name: w.name || "", code: w.code || "" });
    setErrs({});
    setOpen(true);
  };

  const onSubmit = async () => {
    const e = {};
    if (!form.name.trim()) e.name = "Requerido.";
    setErrs(e);
    if (Object.keys(e).length) return;
    try {
      if (editing) {
        await update(editing.id, form);
      } else {
        await create(form);
      }
      setOpen(false);
      setEditing(null);
      setForm({ name: "", code: "" });
      setErrs({});
    } catch {
      /* toast del hook */
    }
  };

  const onDelete = async (w) => {
    const ok = await confirm({
      title: "Eliminar almacén",
      message: `¿Eliminar el almacén "${w.name}"? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove(w.id);
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Almacenes"
        action={
          <PrimaryButton icon={Plus} onClick={openCreate}>
            Nuevo almacén
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando almacenes…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : warehouses.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="Sin almacenes"
          description="Crea el primer almacén."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={[
              {
                key: "nombre",
                title: "Nombre",
                get: (w) => ({ value: w.name || "—", label: w.name || "—" }),
                render: (w) => w.name,
              },
              {
                key: "codigo",
                title: "Código",
                get: (w) => ({ value: w.code || "—", label: w.code || "—" }),
                render: (w) => w.code || "—",
              },
              {
                key: "estado",
                title: "Estado",
                get: (w) => ({
                  value: w.active ? "Activo" : "Inactivo",
                  label: w.active ? "Activo" : "Inactivo",
                }),
                render: (w) => <ActiveCell active={w.active} />,
              },
            ]}
            rows={warehouses}
            rowKey={(w) => w.id}
            storageKey="appolo_mrp_cat_almacenes_cols"
            pageSize={5}
            minWidth={520}
            renderActions={(w) => (
              <RowActionsMenu
                open={openMenuId === w.id}
                onToggle={() =>
                  setOpenMenuId((cur) => (cur === w.id ? null : w.id))
                }
                onClose={() => setOpenMenuId(null)}
                items={[
                  { label: "Editar", icon: Pencil, onClick: () => openEdit(w) },
                  {
                    label: w.active ? "Desactivar" : "Activar",
                    icon: Power,
                    onClick: () => setActive(w.id, !w.active),
                  },
                  {
                    label: "Eliminar",
                    icon: Trash2,
                    danger: true,
                    onClick: () => onDelete(w),
                  },
                ]}
              />
            )}
          />
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar almacén" : "Nuevo almacén"}
        maxWidth={460}
      >
        <Sheet.Body>
          <Field label="Nombre del almacén" required error={errs.name}>
            <Field.Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Almacén Central"
              autoFocus
            />
          </Field>
          <Field label="Código (opcional)">
            <Field.Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="Ej: AC1"
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton
            onClick={() => setOpen(false)}
            disabled={creating || updating}
          >
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onSubmit} loading={editing ? updating : creating}>
            {editing ? "Guardar cambios" : "Crear"}
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}
