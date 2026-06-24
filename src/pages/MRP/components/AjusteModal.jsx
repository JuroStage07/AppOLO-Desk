// MRP Tarimas — modal de ajuste de inventario (positivo / negativo).
//
// Opera sobre el almacén de trabajo seleccionado (useMrpWorkspace).
// REGLA: positivo entra a `pend`; negativo se registra en `descartes` y descuenta
// de una ubicación origen operativa (default `pend`), NUNCA va a `merma`.
import React, { useEffect, useState } from "react";
import {
  Sheet,
  Field,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/ui";
import {
  usePalletAdjustments,
  usePalletBrands,
  useMrpWorkspace,
} from "../../../hooks/mrp";
import {
  PALLET_TYPES,
  PALLET_TYPE_LABELS,
  PALLET_LOCATION_LABELS,
} from "../../../services/mrp";

// Origen válido para un descarte: ubicaciones operativas excepto tienda.
const NEG_ORIGIN_LOCATIONS = ["pend", "almacen", "patio", "reparacion", "merma"];

function initialForm(sign, prefillArg) {
  const prefill = prefillArg || {};
  return {
    sign: sign || "positivo",
    brandId: prefill.brandId || "",
    palletType: prefill.palletType || "",
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
  const { brands } = usePalletBrands({ warehouseId });

  const [form, setForm] = useState(initialForm(defaultSign, prefill));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initialForm(defaultSign, prefill));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const validate = () => {
    const e = {};
    if (!warehouseId) e.brandId = "Selecciona un almacén de trabajo primero.";
    if (!form.brandId) e.brandId = "Seleccione una marca.";
    if (!form.palletType) e.palletType = "Seleccione el tipo.";
    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) e.quantity = "Debe ser mayor a 0.";
    else if (!Number.isInteger(qty)) e.quantity = "Debe ser un número entero.";
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
      brandId: form.brandId,
      palletType: form.palletType,
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

  const isNeg = form.sign === "negativo";

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
                onClick={() => set("sign", "negativo")}
              >
                Negativo (descarte)
              </SecondaryButton>
            )}
          </div>
        </Field>

        <Field label="Marca" required error={errors.brandId}>
          <Field.Select
            value={form.brandId}
            disabled={!warehouseId}
            onChange={(e) => set("brandId", e.target.value)}
          >
            <option value="">— Seleccionar —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Field.Select>
        </Field>

        <Field label="Tipo de tarima" required error={errors.palletType}>
          <Field.Select
            value={form.palletType}
            onChange={(e) => set("palletType", e.target.value)}
          >
            <option value="">— Seleccionar —</option>
            {PALLET_TYPES.map((t) => (
              <option key={t} value={t}>
                {PALLET_TYPE_LABELS[t]}
              </option>
            ))}
          </Field.Select>
        </Field>

        {isNeg && (
          <Field
            label="Ubicación origen del descarte"
            required
            hint="De aquí se descuentan las tarimas. El descarte nunca va a merma."
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
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
            placeholder="0"
          />
        </Field>

        <Field label="Motivo" required error={errors.reason}>
          <Field.Textarea
            value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
            placeholder={
              isNeg ? "Ej: tarimas rotas / mermadas" : "Ej: carga inicial / ingreso"
            }
          />
        </Field>

        {form.sign === "positivo" && (
          <Sheet.Hint>Las tarimas ingresan a la ubicación “Pendiente”.</Sheet.Hint>
        )}
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
