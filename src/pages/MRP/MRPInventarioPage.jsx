// MRP Tarimas — Panel Inventario. Dos vistas por URL: Artículos (pivote por
// ubicación) e Insumos (stock plano). Ambas tablas usan MrpDataTable (filtros
// Excel + reorden por arrastre + primera columna fija).
import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Package, Plus, ArrowLeftRight, FlaskConical } from "lucide-react";
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
  useMrpInsumos,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { PALLET_LOCATION_LABELS } from "../../services/mrp";
import { ACCENT, SLATE } from "../../styles/theme";
import MrpDataTable from "./components/MrpDataTable";
import AjusteModal from "./components/AjusteModal";
import TrasladoModal from "./components/TrasladoModal";
import ArticuloHistorialModal from "./components/ArticuloHistorialModal";

const LOCATION_COLS = ["pend", "almacen", "patio", "reparacion", "merma", "tienda"];

const INV_BASE = "/mrp-tarimas/inventario";
const INV_TABS = [
  { key: "articulos", label: "Artículos", icon: Package },
  { key: "insumos", label: "Insumos", icon: FlaskConical },
];

// Wrapper de Inventario: tabs (Artículos / Insumos) manejados por URL para que
// el submenú lateral pueda enlazar directo a cada inventario.
export default function MRPInventarioPage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const tab = INV_TABS.some((t) => t.key === tabParam) ? tabParam : "articulos";

  return (
    <>
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

      {tab === "insumos" ? <InsumosInventario /> : <ArticulosInventario />}
    </>
  );
}

function ArticulosInventario() {
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
            fontWeight: 950,
            fontSize: 13,
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
            <span style={{ fontWeight: 850 }}>{r.cliente.nombre}</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: SLATE }}>
              {r.cliente.codigo}
            </span>
          </span>
        ) : (
          <span style={{ color: SLATE, fontWeight: 800 }}>—</span>
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
      render: (r) => r.perLocation[loc] || 0,
    })),
    {
      key: "total",
      title: "Total",
      align: "right",
      get: (r) => ({ value: String(r.total), label: String(r.total) }),
      render: (r) => <span style={{ fontWeight: 950 }}>{r.total}</span>,
    },
  ];

  return (
    <>
      <SectionTitle
        title="Inventario de artículos"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PrimaryButton icon={Plus} onClick={() => openAjuste()}>
              Ajuste
            </PrimaryButton>
            <SecondaryButton icon={ArrowLeftRight} onClick={() => openTraslado()}>
              Traslado
            </SecondaryButton>
          </div>
        }
      />

      <SectionTitle
        title="Existencias"
        hint={!loading ? `${rows.length} artículo(s)` : undefined}
      />

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
            minWidth={1120}
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
    </>
  );
}

// Inventario de insumos: lista plana con el `stock` de cada insumo (mrp_insumos,
// sin ubicaciones). Se fija por tenant/company (no depende del almacén). Permite
// ajustar el stock (Ingreso/Salida); el ajuste queda en el Registro de eventos.
function InsumosInventario() {
  const { insumos, loading, error, refetch, adjust, adjusting } = useMrpInsumos({
    includeInactive: false,
  });

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
        <span style={{ fontFamily: "monospace", fontWeight: 950 }}>{i.codigo}</span>
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
      render: (i) => <span style={{ fontWeight: 950 }}>{i.stock ?? 0}</span>,
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
            actionsLabel="Acción"
            renderActions={(i) => (
              <GhostButton size="sm" icon={Plus} onClick={() => openAdjust(i)}>
                Ajustar
              </GhostButton>
            )}
          />
        </Card>
      )}

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
