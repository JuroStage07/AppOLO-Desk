// MRP Tarimas — modal de ajuste de inventario de ARTÍCULOS (positivo / negativo).
//
// Opera sobre el almacén de trabajo seleccionado (useMrpWorkspace).
// REGLA: positivo entra a `pend`; negativo se registra en `descartes` y descuenta
// de una ubicación origen operativa (default `pend`), NUNCA va a `merma`.
import React, { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  Field,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/ui";
import {
  usePalletAdjustments,
  usePalletArticulos,
  usePalletInventory,
  useMrpWorkspace,
} from "../../../hooks/mrp";
import { PALLET_LOCATION_LABELS, PALLET_REASONS } from "../../../services/mrp";

// Origen válido para un descarte: ubicaciones operativas excepto tienda.
const NEG_ORIGIN_LOCATIONS = ["pend", "almacen", "patio", "reparacion", "merma"];

function initialForm(sign, prefillArg) {
  const prefill = prefillArg || {};
  return {
    sign: sign || "positivo",
    articuloId: prefill.articuloId || "",
    quantity: "",
    reason: "",
    originLocation: prefill.originLocation || "pend",
  };
}

export default function AjusteModal({
  open,
  onClose,
  defaultSign = "positivo",
  prefill,
}) {
  const { warehouse, warehouseId } = useMrpWorkspace();
  const { createPositive, createNegative, loading } = usePalletAdjustments();
  const { articulos } = usePalletArticulos({ warehouseId });

  const [form, setForm] = useState(initialForm(defaultSign, prefill));
  const [errors, setErrors] = useState({});

  const isNeg = form.sign === "negativo";

  // Inventario del artículo (para mostrar el disponible en el descarte).
  const { inventory } = usePalletInventory({
    warehouseId,
    articuloId: form.articuloId || null,
    onlyWithStock: false,
  });

  const originAvailable = useMemo(() => {
    if (!isNeg || !form.articuloId || !form.originLocation) return null;
    const row = inventory.find((r) => r.location === form.originLocation);
    return row ? Number(row.quantity) || 0 : 0;
  }, [inventory, isNeg, form.articuloId, form.originLocation]);

  // Total del artículo (suma de ubicaciones); si es 0, no se puede descartar.
  const articuloTotal = useMemo(() => {
    if (!form.articuloId) return null;
    return inventory.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
  }, [inventory, form.articuloId]);
  const noStock = form.articuloId && articuloTotal === 0;

  useEffect(() => {
    if (open) {
      setForm(initialForm(defaultSign, prefill));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Si el artículo no tiene stock, fuerza el ajuste a positivo.
  useEffect(() => {
    if (noStock && form.sign === "negativo") {
      setForm((f) => ({ ...f, sign: "positivo" }));
    }
  }, [noStock, form.sign]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const validate = () => {
    const e = {};
    if (!warehouseId) e.articuloId = "Selecciona un almacén de trabajo primero.";
    if (!form.articuloId) e.articuloId = "Seleccione un artículo.";
    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) e.quantity = "Debe ser mayor a 0.";
    else if (!Number.isInteger(qty)) e.quantity = "Debe ser un número entero.";
    else if (isNeg && originAvailable !== null && qty > originAvailable)
      e.quantity = `Solo hay ${originAvailable} disponible(s) en el origen.`;
    if (!form.reason.trim()) e.reason = "El motivo es obligatorio.";
    if (form.sign === "negativo" && !form.originLocation)
      e.originLocation = "Seleccione la ubicación origen.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    const base = {
      warehouseId,
      articuloId: form.articuloId,
      quantity: Number(form.quantity),
      reason: form.reason.trim(),
    };
    try {
      if (form.sign === "positivo") {
        await createPositive(base);
      } else {
        await createNegative({ ...base, originLocation: form.originLocation });
      }
      onClose?.();
    } catch {
      // el toast de error ya lo muestra el hook
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Ajuste de inventario" maxWidth={560}>
      <Sheet.Body>
        <Sheet.Hint>
          Almacén de trabajo: <b>{warehouse?.name || "— sin seleccionar —"}</b>
        </Sheet.Hint>

        {/* Tipo de ajuste */}
        <Field label="Tipo de ajuste" required>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {form.sign === "positivo" ? (
              <PrimaryButton type="button" block>
                Positivo
              </PrimaryButton>
            ) : (
              <SecondaryButton
                type="button"
                block
                onClick={() => set("sign", "positivo")}
              >
                Positivo
              </SecondaryButton>
            )}
            {isNeg ? (
              <PrimaryButton type="button" block>
                Negativo (descarte)
              </PrimaryButton>
            ) : (
              <SecondaryButton
                type="button"
                block
                disabled={noStock}
                title={
                  noStock ? "El artículo no tiene existencias para descartar" : undefined
                }
                onClick={() => set("sign", "negativo")}
              >
                Negativo (descarte)
              </SecondaryButton>
            )}
          </div>
        </Field>

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

        {isNeg && (
          <Field
            label="Ubicación origen del descarte"
            required
            hint={
              originAvailable !== null
                ? `Disponible: ${originAvailable}`
                : "De aquí se descuentan las unidades. El descarte nunca va a merma."
            }
            error={errors.originLocation}
          >
            <Field.Select
              value={form.originLocation}
              onChange={(e) => set("originLocation", e.target.value)}
            >
              {NEG_ORIGIN_LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {PALLET_LOCATION_LABELS[l]}
                </option>
              ))}
            </Field.Select>
          </Field>
        )}

        <Field label="Cantidad" required error={errors.quantity}>
          <Field.Input
            type="number"
            min={1}
            step={1}
            max={isNeg ? originAvailable ?? undefined : undefined}
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
            placeholder="0"
          />
        </Field>

        <Field label="Motivo" required error={errors.reason}>
          <Field.Select
            value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
          >
            <option value="">— Seleccionar —</option>
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
          Registrar ajuste
        </PrimaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}
