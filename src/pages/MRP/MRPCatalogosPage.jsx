// MRP Tarimas — Catálogos: artículos, insumos, BOM y almacenes.
//
// Insumos y BOM se fijan solo por tenant/company (no dependen del almacén de
// trabajo). Un BOM (Bill of Materials) consume artículos insumo del catálogo
// `Insumos`. Los almacenes se crean con el tenant/company del usuario logeado.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  TableScroll,
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
  FS_SM,
} from "../../styles/theme";
import { th, td } from "./components/mrpFormat";
import { NoWarehouse } from "./components/WorkspaceBar";

const TABS = [
  { key: "articulos", label: "Artículos", icon: Box },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "insumos", label: "Insumos", icon: FlaskConical },
  { key: "bom", label: "BOM", icon: Layers },
  { key: "almacenes", label: "Almacenes", icon: Warehouse },
];

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
  const [tab, setTab] = useState("articulos");

  return (
    <>
      <SectionTitle
        title="Catálogos"
        action={<Badge tone="accent">Configuración</Badge>}
      />

      <ChipsRow>
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </ChipsRow>

      {tab === "articulos" && <ArticulosTab />}
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
// Cada artículo se asigna a UN cliente. Al crear, se pueden seleccionar varios
// clientes: se crea una fila por cliente (código correlativo distinto). Los
// artículos antiguos sin cliente los puede asignar el rol `dev` desde la fila.
function ClienteCell({ cliente }) {
  if (!cliente) return <span style={{ color: SLATE, fontWeight: 800 }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontWeight: 850 }}>{cliente.nombre}</span>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: SLATE }}>
        {cliente.codigo}
      </span>
    </span>
  );
}

function ArticulosTab() {
  const { warehouseId } = useMrpWorkspace();
  const { profile } = useMrpUser();
  const isDev = String(profile?.role || "").toLowerCase() === "dev";

  const {
    articulos,
    loading,
    error,
    refetch,
    createForClientes,
    creating,
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
      e.clientes = "Seleccione al menos un cliente.";
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
          <TableScroll minWidth={680}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Código</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {articulos.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...td, fontFamily: "monospace", fontWeight: 950 }}>
                      {a.codigo}
                    </td>
                    <td style={td}>{a.nombre}</td>
                    <td style={td}>
                      {a.cliente ? (
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
                          Asignar cliente
                        </GhostButton>
                      ) : (
                        <span style={{ color: SLATE, fontWeight: 800 }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      <ActiveCell active={a.active} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <GhostButton size="sm" onClick={() => setActive(a.id, !a.active)}>
                        {a.active ? "Desactivar" : "Activar"}
                      </GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
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
            label="Clientes"
            required
            error={errs.clientes}
            hint={
              loadingClientes
                ? "Cargando clientes…"
                : clientes.length === 0
                ? "No hay clientes activos. Créalos en la pestaña Clientes."
                : "Selecciona uno o más. Se crea un artículo por cliente."
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

      {/* Asignar cliente a un artículo existente (solo dev). */}
      <Sheet
        open={!!assign}
        onClose={() => setAssign(null)}
        title="Asignar cliente"
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
            label="Cliente"
            required
            hint={
              clientes.length === 0
                ? "No hay clientes activos. Créalos en la pestaña Clientes."
                : undefined
            }
          >
            <Field.Select
              value={assignId}
              disabled={loadingClientes || clientes.length === 0}
              onChange={(e) => setAssignId(e.target.value)}
            >
              <option value="">Seleccione un cliente…</option>
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
    </>
  );
}

/* -------------------------------------------------------------- Clientes */
// La pestaña "Clientes" administra el catálogo de clientes. No requiere
// almacén; se fija solo por tenant/company. El código (CL####) se autogenera.
function ClientesTab() {
  const {
    clientes,
    loading,
    error,
    refetch,
    create,
    creating,
    setActive,
    peekNextCode,
  } = usePalletClientes({ includeInactive: true });
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [nextCode, setNextCode] = useState("");
  const [err, setErr] = useState("");

  const openCreate = async () => {
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

  const onCreate = async () => {
    if (!nombre.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }
    try {
      await create({ nombre });
      setOpen(false);
      setNombre("");
      setErr("");
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
      ) : clientes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin clientes"
          description="Crea el primer cliente."
        />
      ) : (
        <Card padding={0}>
          <TableScroll minWidth={480}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Código</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...td, fontFamily: "monospace", fontWeight: 950 }}>
                      {c.codigo}
                    </td>
                    <td style={td}>{c.nombre}</td>
                    <td style={td}>
                      <ActiveCell active={c.active} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <GhostButton size="sm" onClick={() => setActive(c.id, !c.active)}>
                        {c.active ? "Desactivar" : "Activar"}
                      </GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo cliente"
        maxWidth={460}
      >
        <Sheet.Body>
          <Field label="Código" hint="Se asigna automáticamente al guardar.">
            <Field.Input value={nextCode || "Calculando…"} disabled readOnly />
          </Field>
          <Field label="Nombre del cliente" required error={err}>
            <Field.Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: EPA"
              autoFocus
            />
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
          <TableScroll minWidth={760}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Código</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Detalle</th>
                  <th style={{ ...th, textAlign: "right" }}>Precio</th>
                  <th style={th}>Modo</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((i) => (
                  <tr key={i.id}>
                    <td style={{ ...td, fontFamily: "monospace", fontWeight: 950 }}>
                      {i.codigo}
                    </td>
                    <td style={td}>{i.nombre}</td>
                    <td style={{ ...td, whiteSpace: "normal" }}>
                      {i.detalle || "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                      {fmtPrice(i.price)}
                    </td>
                    <td style={td}>
                      {PRICE_MODE_LABELS[i.price_mode] || i.price_mode}
                    </td>
                    <td style={td}>
                      <ActiveCell active={i.active} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <RowActionsMenu
                        open={openMenuId === i.id}
                        onToggle={() =>
                          setOpenMenuId((cur) => (cur === i.id ? null : i.id))
                        }
                        onClose={() => setOpenMenuId(null)}
                        items={[
                          {
                            label: "Editar",
                            icon: Pencil,
                            onClick: () => openEdit(i),
                          },
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
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
              <span style={{ color: SLATE, fontWeight: 700 }}>
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
          <TableScroll minWidth={680}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Código</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Insumos</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {boms.map((r) => {
                  const nombres = (r.insumos || [])
                    .map((i) => `${i.nombre} x ${i.quantity ?? 1}`)
                    .join(", ");
                  return (
                    <tr key={r.id}>
                      <td
                        style={{ ...td, fontFamily: "monospace", fontWeight: 950 }}
                      >
                        {r.codigo}
                      </td>
                      <td style={td}>{r.nombre}</td>
                      <td style={{ ...td, whiteSpace: "normal" }}>
                        {nombres || "—"}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                        {(r.insumos || []).length}
                      </td>
                      <td style={td}>
                        <ActiveCell active={r.active} />
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <RowActionsMenu
                          open={openMenuId === r.id}
                          onToggle={() =>
                            setOpenMenuId((cur) => (cur === r.id ? null : r.id))
                          }
                          onClose={() => setOpenMenuId(null)}
                          items={[
                            {
                              label: "Editar",
                              icon: Pencil,
                              onClick: () => openEdit(r),
                            },
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
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
              <span style={{ color: SLATE, fontWeight: 950, fontSize: 12 }}>
                Insumos seleccionados ({selected.length})
              </span>
              <div style={{ display: "grid", gap: 6 }}>
                {selected.map((s) => (
                  <div key={s.id} style={selectedRow}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 950 }}>
                        {s.codigo}
                      </span>{" "}
                      {s.nombre}
                    </span>
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span style={{ color: SLATE, fontWeight: 900 }}>x</span>
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
  fontWeight: 800,
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
  fontWeight: 850,
  fontSize: 13,
  color: TEXT,
  cursor: "pointer",
};

const selectedRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 12px",
  borderRadius: 12,
  background: "#F2F4FB",
  fontWeight: 800,
  fontSize: 13,
  color: TEXT,
};

/* ------------------------------------------------------------ Almacenes */
function AlmacenesTab() {
  const { warehouses, loading, error, refetch, create, creating, setActive } =
    usePalletWarehouses({ includeInactive: true });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });
  const [errs, setErrs] = useState({});

  const onCreate = async () => {
    const e = {};
    if (!form.name.trim()) e.name = "Requerido.";
    setErrs(e);
    if (Object.keys(e).length) return;
    try {
      await create(form);
      setOpen(false);
      setForm({ name: "", code: "" });
      setErrs({});
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Almacenes"
        action={
          <PrimaryButton icon={Plus} onClick={() => setOpen(true)}>
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
          <TableScroll minWidth={520}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Nombre</th>
                  <th style={th}>Código</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id}>
                    <td style={td}>{w.name}</td>
                    <td style={td}>{w.code || "—"}</td>
                    <td style={td}>
                      <ActiveCell active={w.active} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <GhostButton size="sm" onClick={() => setActive(w.id, !w.active)}>
                        {w.active ? "Desactivar" : "Activar"}
                      </GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Nuevo almacén" maxWidth={460}>
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
          <SecondaryButton onClick={() => setOpen(false)} disabled={creating}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onCreate} loading={creating}>
            Crear
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}
