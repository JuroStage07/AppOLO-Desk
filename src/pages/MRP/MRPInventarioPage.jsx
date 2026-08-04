// MRP Tarimas — Panel Inventario. Dos vistas por URL: Artículos (pivote por
// ubicación) e Insumos (stock plano). Ambas tablas usan MrpDataTable (filtros
// Excel + reorden por arrastre + primera columna fija).
import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Package, Plus, Minus, ArrowLeftRight, FlaskConical, Store } from "lucide-react";
import {
  Card,
  Chip,
  ChipsRow,
  Field,
  Sheet,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import {
  usePalletInventory,
  usePalletArticulos,
  usePalletTiendas,
  useMrpInsumos,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { PALLET_LOCATION_LABELS } from "../../services/mrp";
import {
  ACCENT,
  SLATE,
  TEXT,
  FS_XS,
  FS_SM,
  FS_BASE,
  FS_LG,
  FW_BOLD,
  FW_EXTRABOLD,
} from "../../styles/theme";
import useIsMobile from "../../hooks/useIsMobile";
import MrpDataTable from "./components/MrpDataTable";
import { CodeText } from "./components/mrpUi";
import AjusteModal from "./components/AjusteModal";
import TrasladoModal from "./components/TrasladoModal";
import ArticuloHistorialModal from "./components/ArticuloHistorialModal";
import ArticuloTiendaModal from "./components/ArticuloTiendaModal";

const LOCATION_COLS = ["pend", "almacen", "patio", "reparacion", "merma", "tienda"];

const INV_BASE = "/mrp-tarimas/inventario";
const INV_TABS = [
  { key: "articulos", label: "Artículos", icon: Package },
  { key: "insumos", label: "Insumos", icon: FlaskConical },
  { key: "tiendas", label: "En Cliente / Tienda", icon: Store },
];

// Wrapper de Inventario: tabs (Artículos / Insumos) manejados por URL para que
// el submenú lateral pueda enlazar directo a cada inventario.
export default function MRPInventarioPage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const tab = INV_TABS.some((t) => t.key === tabParam) ? tabParam : "articulos";

  return (
    <>
      {/* Chips sólo en móvil: en escritorio la navegación Artículos/Insumos vive
          en el submenú lateral (acordeón "Inventario"). */}
      {isMobile ? (
        <ChipsRow>
          {INV_TABS.map((t) => (
            <Chip
              key={t.key}
              active={tab === t.key}
              onClick={() => navigate(`${INV_BASE}/${t.key}`)}
            >
              {t.label}
            </Chip>
          ))}
        </ChipsRow>
      ) : null}

      {tab === "insumos" ? (
        <InsumosInventario />
      ) : tab === "tiendas" ? (
        <TiendaInventario />
      ) : (
        <ArticulosInventario />
      )}
    </>
  );
}

function ArticulosInventario() {
  const isMobile = useIsMobile();
  const { warehouseId } = useMrpWorkspace();

  const { articulos } = usePalletArticulos({ warehouseId });
  const { inventory, loading, error, refetch } = usePalletInventory({
    warehouseId,
    articuloId: null,
    onlyWithStock: false,
  });

  const byArticulo = useMemo(() => {
    const m = new Map();
    for (const r of inventory) {
      const cell = m.get(r.articulo_id) || {};
      cell[r.location] = (cell[r.location] || 0) + (Number(r.quantity) || 0);
      m.set(r.articulo_id, cell);
    }
    return m;
  }, [inventory]);

  const rows = useMemo(() => {
    return articulos.map((a) => {
      const cells = byArticulo.get(a.id) || {};
      let total = 0;
      const perLocation = {};
      for (const loc of LOCATION_COLS) {
        const q = cells[loc] || 0;
        perLocation[loc] = q;
        total += q;
      }
      return {
        id: a.id,
        codigo: a.codigo,
        nombre: a.nombre,
        cliente: a.cliente || null,
        perLocation,
        total,
      };
    });
  }, [articulos, byArticulo]);

  const [ajuste, setAjuste] = useState({ open: false, prefill: null });
  const [traslado, setTraslado] = useState({ open: false, prefill: null });
  const [historial, setHistorial] = useState(null);
  const [tiendaDist, setTiendaDist] = useState(null);
  const openAjuste = (prefill = null) => setAjuste({ open: true, prefill });
  const openTraslado = (prefill = null) => setTraslado({ open: true, prefill });

  const columns = [
    {
      key: "codigo",
      title: "Artículo",
      get: (r) => ({ value: r.codigo || "—", label: r.codigo || "—" }),
      render: (r) => (
        <button
          type="button"
          onClick={() =>
            setHistorial({ id: r.id, codigo: r.codigo, nombre: r.nombre })
          }
          title="Ver historial del artículo"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "monospace",
            fontWeight: FW_EXTRABOLD,
            fontSize: FS_BASE,
            color: ACCENT,
            textDecoration: "underline",
          }}
        >
          {r.codigo}
        </button>
      ),
    },
    {
      key: "nombre",
      title: "Descripción",
      get: (r) => ({ value: r.nombre || "—", label: r.nombre || "—" }),
      render: (r) => r.nombre,
    },
    {
      key: "compania",
      title: "Compañía",
      get: (r) => ({
        value: r.cliente?.nombre || "—",
        label: r.cliente?.nombre || "—",
      }),
      render: (r) =>
        r.cliente ? (
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontWeight: FW_BOLD }}>{r.cliente.nombre}</span>
            <span style={{ fontFamily: "monospace", fontSize: FS_XS, color: SLATE }}>
              {r.cliente.codigo}
            </span>
          </span>
        ) : (
          <span style={{ color: SLATE, fontWeight: FW_BOLD }}>—</span>
        ),
    },
    ...LOCATION_COLS.map((loc) => ({
      key: `loc_${loc}`,
      title: PALLET_LOCATION_LABELS[loc],
      align: "right",
      get: (r) => ({
        value: String(r.perLocation[loc] || 0),
        label: String(r.perLocation[loc] || 0),
      }),
      render: (r) => {
        const qty = r.perLocation[loc] || 0;
        // La celda de "tienda" con cantidad abre la distribución por tienda.
        if (loc === "tienda" && qty > 0) {
          return (
            <button
              type="button"
              onClick={() =>
                setTiendaDist({ id: r.id, codigo: r.codigo, nombre: r.nombre })
              }
              title="Ver distribución por tienda"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontWeight: FW_EXTRABOLD,
                color: ACCENT,
                textDecoration: "underline",
              }}
            >
              {qty}
            </button>
          );
        }
        return qty;
      },
    })),
    {
      key: "total",
      title: "Total",
      align: "right",
      get: (r) => ({ value: String(r.total), label: String(r.total) }),
      render: (r) => <span style={{ fontWeight: FW_EXTRABOLD }}>{r.total}</span>,
    },
  ];

  return (
    <>
      {/* Encabezado de 3 zonas: (izq) título "Existencias" + conteo,
          (centro) nombre de la vista, (der) acciones. En móvil se apila. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
          marginTop: 8,
          marginBottom: 6,
          textAlign: isMobile ? "center" : undefined,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 2,
            justifyItems: isMobile ? "center" : "start",
          }}
        >
          <div style={{ fontWeight: FW_EXTRABOLD, fontSize: FS_LG, color: TEXT }}>
            Existencias
          </div>
          {!loading ? (
            <div style={{ color: SLATE, fontWeight: FW_BOLD, fontSize: FS_SM }}>
              {rows.length} artículo(s)
            </div>
          ) : null}
        </div>

        <div
          style={{
            fontWeight: FW_EXTRABOLD,
            fontSize: FS_LG,
            color: TEXT,
            textAlign: "center",
          }}
        >
          Inventario de artículos
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: isMobile ? "center" : "flex-end",
          }}
        >
          <PrimaryButton icon={Plus} onClick={() => openAjuste()}>
            Ajuste
          </PrimaryButton>
          <SecondaryButton icon={ArrowLeftRight} onClick={() => openTraslado()}>
            Traslado
          </SecondaryButton>
        </div>
      </div>

      {loading ? (
        <Spinner label="Cargando inventario…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin artículos"
          description="Crea artículos en Catálogos › Artículos y registra ajustes."
          action={
            <PrimaryButton icon={Plus} onClick={() => openAjuste()}>
              Registrar ajuste
            </PrimaryButton>
          }
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            storageKey="appolo_mrp_inv_art_cols"
            pageSize={5}
            minWidth={0}
            actionsLabel="Acciones"
            renderActions={(r) => (
              <div
                style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}
              >
                <GhostButton
                  size="sm"
                  icon={ArrowLeftRight}
                  disabled={r.total === 0}
                  title={r.total === 0 ? "Sin existencias para trasladar" : undefined}
                  onClick={() => openTraslado({ articuloId: r.id })}
                >
                  Trasladar
                </GhostButton>
                <GhostButton
                  size="sm"
                  icon={Plus}
                  onClick={() => openAjuste({ articuloId: r.id })}
                >
                  Ajustar
                </GhostButton>
              </div>
            )}
          />
        </Card>
      )}

      <AjusteModal
        open={ajuste.open}
        prefill={ajuste.prefill}
        onClose={() => setAjuste({ open: false, prefill: null })}
      />
      <TrasladoModal
        open={traslado.open}
        prefill={traslado.prefill}
        onClose={() => setTraslado({ open: false, prefill: null })}
      />
      {historial && (
        <ArticuloHistorialModal
          open
          articuloId={historial.id}
          codigo={historial.codigo}
          nombre={historial.nombre}
          onClose={() => setHistorial(null)}
          onAjuste={(id) => {
            setHistorial(null);
            openAjuste({ articuloId: id });
          }}
          onTraslado={(id) => {
            setHistorial(null);
            openTraslado({ articuloId: id });
          }}
        />
      )}
      {tiendaDist && (
        <ArticuloTiendaModal
          open
          articuloId={tiendaDist.id}
          codigo={tiendaDist.codigo}
          nombre={tiendaDist.nombre}
          onClose={() => setTiendaDist(null)}
        />
      )}
    </>
  );
}

// Inventario de insumos: lista plana con el `stock` de cada insumo (mrp_insumos,
// sin ubicaciones). Se fija por tenant/company (no depende del almacén). Permite
// ajustar el stock (Ingreso/Salida); el ajuste queda en el Registro de eventos.
function InsumosInventario() {
  const { insumos, loading, error, refetch, adjust, adjusting, consume, consuming } =
    useMrpInsumos({ includeInactive: false });

  const totalStock = useMemo(
    () => insumos.reduce((s, i) => s + (Number(i.stock) || 0), 0),
    [insumos]
  );

  const [target, setTarget] = useState(null); // insumo en ajuste o null
  const [mode, setMode] = useState("entrada"); // "entrada" | "salida"
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  const openAdjust = (i) => {
    setTarget(i);
    setMode("entrada");
    setQuantity("");
    setReason("");
    setErr("");
  };

  // Estado del modal de consumo (salida vía RPC atómica).
  const [consumeTarget, setConsumeTarget] = useState(null);
  const [consumeQty, setConsumeQty] = useState("");
  const [consumeReason, setConsumeReason] = useState("");
  const [consumeErr, setConsumeErr] = useState("");

  const openConsume = (i) => {
    setConsumeTarget(i);
    setConsumeQty("");
    setConsumeReason("");
    setConsumeErr("");
  };

  const onConsume = async () => {
    const qc = Number(consumeQty);
    if (!Number.isInteger(qc) || qc <= 0) {
      setConsumeErr("La cantidad debe ser un entero mayor a 0.");
      return;
    }
    if (qc > (Number(consumeTarget?.stock) || 0)) {
      setConsumeErr("No hay stock suficiente para ese consumo.");
      return;
    }
    try {
      await consume({
        items: [{ insumoId: consumeTarget.id, quantity: qc }],
        reason: consumeReason,
      });
      setConsumeTarget(null);
    } catch {
      /* toast del hook */
    }
  };

  const consumeCurrent = Number(consumeTarget?.stock) || 0;
  const qc = Number(consumeQty);
  const consumePreview =
    consumeTarget && Number.isInteger(qc) && qc > 0 ? consumeCurrent - qc : null;

  const onAdjust = async () => {
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      setErr("La cantidad debe ser mayor a 0.");
      return;
    }
    if (!Number.isInteger(q)) {
      setErr("La cantidad debe ser un número entero.");
      return;
    }
    try {
      await adjust(target.id, { mode, quantity: q, reason });
      setTarget(null);
    } catch {
      /* toast del hook */
    }
  };

  const current = Number(target?.stock) || 0;
  const q = Number(quantity);
  const preview =
    target && Number.isFinite(q) && q > 0
      ? mode === "salida"
        ? current - q
        : current + q
      : null;

  const columns = [
    {
      key: "codigo",
      title: "Código",
      get: (i) => ({ value: i.codigo || "—", label: i.codigo || "—" }),
      render: (i) => (
        <span style={{ fontFamily: "monospace", fontWeight: FW_EXTRABOLD }}>{i.codigo}</span>
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
      key: "stock",
      title: "Stock",
      align: "right",
      get: (i) => ({ value: String(i.stock ?? 0), label: String(i.stock ?? 0) }),
      render: (i) => <span style={{ fontWeight: FW_EXTRABOLD }}>{i.stock ?? 0}</span>,
    },
  ];

  return (
    <>
      <SectionTitle
        title="Inventario de insumos"
        hint={
          !loading
            ? `${insumos.length} insumo(s) · ${totalStock} en stock`
            : undefined
        }
      />

      {loading ? (
        <Spinner label="Cargando inventario…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : insumos.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="Sin insumos"
          description="Crea insumos en Catálogos › Insumos."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={columns}
            rows={insumos}
            rowKey={(i) => i.id}
            storageKey="appolo_mrp_inv_ins_cols"
            pageSize={5}
            minWidth={640}
            actionsLabel="Acciones"
            renderActions={(i) => (
              <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                <GhostButton
                  size="sm"
                  icon={Minus}
                  disabled={(Number(i.stock) || 0) <= 0}
                  title={
                    (Number(i.stock) || 0) <= 0
                      ? "Sin stock para consumir"
                      : "Consumir insumo"
                  }
                  onClick={() => openConsume(i)}
                >
                  Consumir
                </GhostButton>
                <GhostButton size="sm" icon={Plus} onClick={() => openAdjust(i)}>
                  Ajustar
                </GhostButton>
              </div>
            )}
          />
        </Card>
      )}

      <Sheet
        open={!!consumeTarget}
        onClose={() => setConsumeTarget(null)}
        title="Consumir insumo"
        maxWidth={460}
      >
        <Sheet.Body>
          <Field label="Insumo">
            <Field.Input
              value={
                consumeTarget ? `${consumeTarget.codigo} — ${consumeTarget.nombre}` : ""
              }
              disabled
              readOnly
            />
          </Field>
          <Field
            label="Cantidad a consumir"
            required
            error={consumeErr}
            hint={
              consumePreview !== null
                ? `Stock: ${consumeCurrent} → ${consumePreview}`
                : `Stock actual: ${consumeCurrent}`
            }
          >
            <Field.Input
              type="number"
              min={1}
              step={1}
              value={consumeQty}
              onChange={(e) => setConsumeQty(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </Field>
          <Field label="Motivo (opcional)">
            <Field.Input
              value={consumeReason}
              onChange={(e) => setConsumeReason(e.target.value)}
              placeholder="Ej: Consumo producción del día"
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setConsumeTarget(null)} disabled={consuming}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onConsume} loading={consuming}>
            Registrar consumo
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      <Sheet
        open={!!target}
        onClose={() => setTarget(null)}
        title="Ajustar stock de insumo"
        maxWidth={460}
      >
        <Sheet.Body>
          <Field label="Insumo">
            <Field.Input
              value={target ? `${target.codigo} — ${target.nombre}` : ""}
              disabled
              readOnly
            />
          </Field>
          <Field label="Tipo de ajuste">
            <ChipsRow>
              <Chip active={mode === "entrada"} onClick={() => setMode("entrada")}>
                Ingreso
              </Chip>
              <Chip active={mode === "salida"} onClick={() => setMode("salida")}>
                Salida
              </Chip>
            </ChipsRow>
          </Field>
          <Field
            label="Cantidad"
            required
            error={err}
            hint={
              preview !== null
                ? `Stock: ${current} → ${preview}`
                : `Stock actual: ${current}`
            }
          >
            <Field.Input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </Field>
          <Field label="Motivo (opcional)">
            <Field.Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Consumo producción"
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setTarget(null)} disabled={adjusting}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onAdjust} loading={adjusting}>
            Registrar ajuste
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}

// Inventario "En tienda": pivote artículo × tienda del stock que está en la
// ubicación `tienda`. Cada tienda del catálogo es una columna; la primera es el
// N° de artículo. Requiere el rastreo por tienda del inventario (store_id) que
// vive en `pallet_inventory_articulo` (ver supabase/mrp_tienda_inventario.sql).
function TiendaInventario() {
  const { warehouseId } = useMrpWorkspace();
  const { tiendas, loading: loadingTiendas } = usePalletTiendas({
    includeInactive: false,
  });
  const { inventory, loading, error, refetch } = usePalletInventory({
    warehouseId,
    location: "tienda",
    onlyWithStock: false,
  });

  // Agrupa el inventario de la ubicación `tienda` por artículo, con el desglose
  // por tienda (store_id) y una bolsa "Sin asignar" (store_id nulo).
  const { rows, hasUnassigned } = useMemo(() => {
    const byArt = new Map();
    let unassignedAny = false;
    for (const r of inventory) {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) continue;
      const art = r.articulo || {};
      let row = byArt.get(r.articulo_id);
      if (!row) {
        row = {
          id: r.articulo_id,
          codigo: art.codigo || "—",
          nombre: art.nombre || "",
          perTienda: {},
          unassigned: 0,
          total: 0,
        };
        byArt.set(r.articulo_id, row);
      }
      if (r.store_id) {
        row.perTienda[r.store_id] = (row.perTienda[r.store_id] || 0) + qty;
      } else {
        row.unassigned += qty;
        unassignedAny = true;
      }
      row.total += qty;
    }
    const list = Array.from(byArt.values()).sort((a, b) =>
      String(a.codigo).localeCompare(String(b.codigo), "es")
    );
    return { rows: list, hasUnassigned: unassignedAny };
  }, [inventory]);

  const columns = useMemo(() => {
    const cols = [
      {
        key: "codigo",
        title: "N° Artículo",
        get: (r) => ({ value: r.codigo || "—", label: r.codigo || "—" }),
        render: (r) => <CodeText>{r.codigo}</CodeText>,
      },
    ];
    for (const t of tiendas) {
      cols.push({
        key: `t_${t.id}`,
        title: t.nombre,
        align: "right",
        get: (r) => {
          const v = r.perTienda[t.id] || 0;
          return { value: String(v), label: String(v) };
        },
        render: (r) => r.perTienda[t.id] || 0,
      });
    }
    if (hasUnassigned) {
      cols.push({
        key: "unassigned",
        title: "Sin asignar",
        align: "right",
        get: (r) => ({
          value: String(r.unassigned || 0),
          label: String(r.unassigned || 0),
        }),
        render: (r) => r.unassigned || 0,
      });
    }
    cols.push({
      key: "total",
      title: "Total",
      align: "right",
      get: (r) => ({ value: String(r.total), label: String(r.total) }),
      render: (r) => <span style={{ fontWeight: FW_EXTRABOLD }}>{r.total}</span>,
    });
    return cols;
  }, [tiendas, hasUnassigned]);

  const busy = loading || loadingTiendas;

  return (
    <>
      <SectionTitle
        title="Inventario en tienda"
        hint={!busy ? `${rows.length} artículo(s) en tienda` : undefined}
      />

      {busy ? (
        <Spinner label="Cargando inventario…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin stock en tienda"
          description="Traslada artículos a la ubicación tienda para verlos aquí."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            storageKey="appolo_mrp_inv_tienda_cols"
            pageSize={5}
            minWidth={0}
          />
        </Card>
      )}
    </>
  );
}
