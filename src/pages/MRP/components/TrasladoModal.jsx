// MRP Tarimas — modal de traslado de ARTÍCULOS entre ubicaciones.
//
// Opera sobre el almacén de trabajo seleccionado (useMrpWorkspace).
// Valida origen/destino, stock suficiente (en la RPC). Crea task_id + movimiento.
import React, { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  Field,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/ui";
import {
  usePalletTransfers,
  usePalletArticulos,
  usePalletInventory,
  useMrpWorkspace,
} from "../../../hooks/mrp";
import {
  PALLET_LOCATIONS,
  PALLET_LOCATION_LABELS,
  PALLET_REASONS,
} from "../../../services/mrp";

function initialForm(prefillArg) {
  const prefill = prefillArg || {};
  return {
    originLocation: prefill.originLocation || "",
    destinationLocation: prefill.destinationLocation || "",
    articuloId: prefill.articuloId || "",
    quantity: "",
    reason: "",
  };
}

export default function TrasladoModal({ open, onClose, prefill }) {
  const { warehouse, warehouseId } = useMrpWorkspace();
  const { transfer, loading } = usePalletTransfers();
  const { articulos } = usePalletArticulos({ warehouseId });

  const [form, setForm] = useState(initialForm(prefill));
  const [errors, setErrors] = useState({});

  // Inventario del artículo seleccionado (para mostrar el disponible por ubicación).
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
      setForm(initialForm(prefill));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const validate = () => {
    const e = {};
    if (!warehouseId) e.originLocation = "Selecciona un almacén de trabajo primero.";
    if (!form.originLocation) e.originLocation = "Seleccione el origen.";
    if (!form.destinationLocation) e.destinationLocation = "Seleccione el destino.";
    if (
      form.originLocation &&
      form.originLocation === form.destinationLocation
    )
      e.destinationLocation = "El origen y el destino no pueden ser iguales.";
    if (!form.articuloId) e.articuloId = "Seleccione un artículo.";
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
      await transfer({
        warehouseId,
        originLocation: form.originLocation,
        destinationLocation: form.destinationLocation,
        articuloId: form.articuloId,
        quantity: Number(form.quantity),
        reason: form.reason.trim() || null,
      });
      onClose?.();
    } catch {
      // toast de error ya mostrado por el hook (incluye "stock insuficiente")
    }
  };

  const locationOptions = (
    <>
      <option value="">— Seleccionar —</option>
      {PALLET_LOCATIONS.map((l) => (
        <option key={l} value={l}>
          {PALLET_LOCATION_LABELS[l]}
        </option>
      ))}
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Traslado de artículos" maxWidth={620}>
      <Sheet.Body>
        <Sheet.Hint>
          Almacén de trabajo: <b>{warehouse?.name || "— sin seleccionar —"}</b>
        </Sheet.Hint>

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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field
            label="Ubicación origen"
            required
            error={errors.originLocation}
            hint={
              originAvailable !== null
                ? `Disponible: ${originAvailable}`
                : undefined
            }
          >
            <Field.Select
              value={form.originLocation}
              disabled={!form.articuloId}
              onChange={(e) => set("originLocation", e.target.value)}
            >
              {locationOptions}
            </Field.Select>
          </Field>
          <Field label="Ubicación destino" required error={errors.destinationLocation}>
            <Field.Select
              value={form.destinationLocation}
              disabled={!form.articuloId}
              onChange={(e) => set("destinationLocation", e.target.value)}
            >
              {locationOptions}
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
            {PALLET_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Field.Select>
        </Field>
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
