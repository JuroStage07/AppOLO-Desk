// MRP Tarimas — modal de traslado. Dos modos (chip):
//   • "Traslado de artículos"   — entre UBICACIONES del almacén de trabajo.
//   • "Traslado entre almacenes" — tarimas del almacén de trabajo (origen) a otro
//     almacén del mismo tenant. El artículo destino se resuelve por nombre y se
//     auto-crea si no existe. Registra un evento en cada almacén.
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Warehouse } from "lucide-react";
import {
  Sheet,
  Field,
  Chip,
  ChipsRow,
  PrimaryButton,
  SecondaryButton,
  useConfirm,
} from "../../../components/ui";
import { findArticuloByNombre } from "../../../services/mrp";
import {
  usePalletTransfers,
  usePalletArticulos,
  usePalletInventory,
  usePalletWarehouses,
  usePalletMotivos,
  useMrpWorkspace,
} from "../../../hooks/mrp";
import useIsMobile from "../../../hooks/useIsMobile";
import {
  PALLET_LOCATIONS,
  PALLET_LOCATION_LABELS,
  PALLET_REASONS,
  INTAKE_LOCATION,
} from "../../../services/mrp";

function initialForm(prefillArg, mode) {
  const prefill = prefillArg || {};
  return {
    originLocation: prefill.originLocation || "",
    destinationLocation: mode === "almacenes" ? INTAKE_LOCATION : prefill.destinationLocation || "",
    destWarehouseId: "",
    articuloId: prefill.articuloId || "",
    quantity: "",
    reason: "",
  };
}

export default function TrasladoModal({ open, onClose, prefill }) {
  const { warehouse, warehouseId } = useMrpWorkspace();
  const confirm = useConfirm();
  const { transfer, transferBetweenWarehouses, loading } = usePalletTransfers();
  const { articulos } = usePalletArticulos({ warehouseId });
  const { warehouses } = usePalletWarehouses();

  const isMobile = useIsMobile(560);

  const [mode, setMode] = useState("articulos"); // "articulos" | "almacenes"
  const [form, setForm] = useState(initialForm(prefill, "articulos"));
  const [errors, setErrors] = useState({});

  const isWh = mode === "almacenes";

  // Motivos del catálogo según el tipo de traslado (fallback a los por defecto).
  const { motivos } = usePalletMotivos({
    tipo: isWh ? "traslado_almacen" : "traslado",
  });
  const reasonOptions = motivos.length ? motivos.map((m) => m.label) : PALLET_REASONS;

  // Otros almacenes del mismo tenant (destinos posibles).
  const destWarehouses = useMemo(
    () => warehouses.filter((w) => w.id !== warehouseId),
    [warehouses, warehouseId]
  );

  // Inventario del artículo seleccionado (disponible por ubicación en el origen).
  const { inventory } = usePalletInventory({
    warehouseId,
    articuloId: form.articuloId || null,
    onlyWithStock: false,
  });

  const originAvailable = useMemo(() => {
    if (!form.articuloId || !form.originLocation) return null;
    const row = inventory.find((r) => r.location === form.originLocation);
    return row ? Number(row.quantity) || 0 : 0;
  }, [inventory, form.articuloId, form.originLocation]);

  useEffect(() => {
    if (open) {
      setMode("articulos");
      setForm(initialForm(prefill, "articulos"));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setForm(initialForm(prefill, next));
    setErrors({});
  };

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const validate = () => {
    const e = {};
    if (!warehouseId) e.articuloId = "La bodega activa no tiene un almacén ligado.";
    if (!form.articuloId) e.articuloId = "Seleccione un artículo.";
    if (!form.originLocation) e.originLocation = "Seleccione el origen.";

    if (isWh) {
      if (!form.destWarehouseId) e.destWarehouseId = "Seleccione el almacén destino.";
      if (!form.destinationLocation) e.destinationLocation = "Seleccione la ubicación destino.";
    } else {
      if (!form.destinationLocation) e.destinationLocation = "Seleccione el destino.";
      if (form.originLocation && form.originLocation === form.destinationLocation)
        e.destinationLocation = "El origen y el destino no pueden ser iguales.";
    }

    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) e.quantity = "Debe ser mayor a 0.";
    else if (!Number.isInteger(qty)) e.quantity = "Debe ser un número entero.";
    else if (originAvailable !== null && qty > originAvailable)
      e.quantity = `Solo hay ${originAvailable} disponible(s) en el origen.`;

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      if (isWh) {
        // Si el artículo no existe en el almacén destino, confirmar la auto-creación.
        const art = articulos.find((a) => a.id === form.articuloId);
        let exists = true;
        try {
          exists = !!(await findArticuloByNombre(form.destWarehouseId, art?.nombre));
        } catch {
          exists = true; // ante la duda no bloqueamos; la RPC decide igual
        }
        if (!exists) {
          const destName =
            destWarehouses.find((w) => w.id === form.destWarehouseId)?.name ||
            "destino";
          const ok = await confirm({
            title: "Crear artículo en almacén destino",
            message: `El artículo "${art?.codigo} · ${art?.nombre}" no existe en el almacén "${destName}". Se creará automáticamente (mismo nombre, código nuevo) para completar el traslado. ¿Continuar?`,
            confirmText: "Crear y trasladar",
            tone: "warning",
          });
          if (!ok) return;
        }

        await transferBetweenWarehouses({
          originWarehouseId: warehouseId,
          destWarehouseId: form.destWarehouseId,
          articuloId: form.articuloId,
          originLocation: form.originLocation,
          destinationLocation: form.destinationLocation,
          quantity: Number(form.quantity),
          reason: form.reason.trim() || null,
        });
      } else {
        await transfer({
          warehouseId,
          originLocation: form.originLocation,
          destinationLocation: form.destinationLocation,
          articuloId: form.articuloId,
          quantity: Number(form.quantity),
          reason: form.reason.trim() || null,
        });
      }
      onClose?.();
    } catch {
      // toast de error ya mostrado por el hook
    }
  };

  const locationOptions = (locations) => (
    <>
      <option value="">— Seleccionar —</option>
      {locations.map((l) => (
        <option key={l} value={l}>
          {PALLET_LOCATION_LABELS[l]}
        </option>
      ))}
    </>
  );

  const allLocations = PALLET_LOCATIONS;
  const whLocations = PALLET_LOCATIONS.filter((l) => l !== "tienda");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isWh ? "Traslado entre almacenes" : "Traslado de artículos"}
      maxWidth={620}
    >
      <Sheet.Body>
        <ChipsRow>
          <Chip active={!isWh} onClick={() => switchMode("articulos")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ArrowLeftRight size={14} strokeWidth={2.4} />
              Traslado de artículos
            </span>
          </Chip>
          <Chip active={isWh} onClick={() => switchMode("almacenes")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Warehouse size={14} strokeWidth={2.4} />
              Traslado entre almacenes
            </span>
          </Chip>
        </ChipsRow>

        <Sheet.Hint>
          {isWh ? "Almacén origen" : "Almacén de trabajo"}:{" "}
          <b>{warehouse?.name || "— sin ligar —"}</b>
        </Sheet.Hint>

        {isWh && (
          <Field label="Almacén destino" required error={errors.destWarehouseId}>
            <Field.Select
              value={form.destWarehouseId}
              disabled={!warehouseId}
              onChange={(e) => set("destWarehouseId", e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {destWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.code ? ` (${w.code})` : ""}
                </option>
              ))}
            </Field.Select>
          </Field>
        )}

        <Field label="Artículo" required error={errors.articuloId}>
          <Field.Select
            value={form.articuloId}
            disabled={!warehouseId}
            onChange={(e) => set("articuloId", e.target.value)}
          >
            <option value="">— Seleccionar —</option>
            {articulos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo} · {a.nombre}
              </option>
            ))}
          </Field.Select>
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 12,
          }}
        >
          <Field
            label="Ubicación origen"
            required
            error={errors.originLocation}
            hint={originAvailable !== null ? `Disponible: ${originAvailable}` : undefined}
          >
            <Field.Select
              value={form.originLocation}
              disabled={!form.articuloId}
              onChange={(e) => set("originLocation", e.target.value)}
            >
              {locationOptions(isWh ? whLocations : allLocations)}
            </Field.Select>
          </Field>
          <Field
            label={isWh ? "Ubicación destino (en almacén destino)" : "Ubicación destino"}
            required
            error={errors.destinationLocation}
          >
            <Field.Select
              value={form.destinationLocation}
              disabled={!form.articuloId}
              onChange={(e) => set("destinationLocation", e.target.value)}
            >
              {locationOptions(isWh ? whLocations : allLocations)}
            </Field.Select>
          </Field>
        </div>

        <Field label="Cantidad" required error={errors.quantity}>
          <Field.Input
            type="number"
            min={1}
            step={1}
            max={originAvailable ?? undefined}
            value={form.quantity}
            disabled={!form.articuloId}
            onChange={(e) => set("quantity", e.target.value)}
            placeholder="0"
          />
        </Field>

        <Field label="Motivo (opcional)">
          <Field.Select
            value={form.reason}
            disabled={!form.articuloId}
            onChange={(e) => set("reason", e.target.value)}
          >
            <option value="">— Sin motivo —</option>
            {reasonOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Field.Select>
        </Field>

        {isWh && (
          <Sheet.Hint>
            Si el artículo no existe en el almacén destino, se creará
            automáticamente (mismo nombre, código nuevo).
          </Sheet.Hint>
        )}
      </Sheet.Body>

      <Sheet.Actions>
        <SecondaryButton onClick={onClose} disabled={loading}>
          Cancelar
        </SecondaryButton>
        <PrimaryButton onClick={onSubmit} loading={loading} disabled={!warehouseId}>
          Registrar traslado
        </PrimaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}
