import React, { useEffect, useMemo } from "react";
import { Field } from "../../../components/ui";
import {
  TENANT_OPTIONS,
  COMPANY_OPTIONS,
  DEFAULT_COMPANY,
  getBodegasForScope,
} from "../../../config/bodegas";

/**
 * Selector de scope (país/tenant → compañía → bodega) para el registro de un
 * usuario de Supabase. Controlado: recibe { tenantId, company, bodegaId } y
 * emite cambios vía onChange. Al cambiar de tenant/compañía reajusta la bodega
 * a la primera disponible del scope.
 */
export default function ScopeSelector({ value, onChange }) {
  const tenantId = value?.tenantId || "";
  const company = value?.company || DEFAULT_COMPANY;
  const bodegaId = value?.bodegaId || "";

  const bodegas = useMemo(
    () => (tenantId ? getBodegasForScope(tenantId, company) : []),
    [tenantId, company]
  );

  // Si la bodega actual no pertenece al scope, cae a la primera disponible.
  useEffect(() => {
    if (!tenantId) return;
    const valida = bodegas.some((b) => b.id === bodegaId);
    if (!valida) {
      onChange?.({ tenantId, company, bodegaId: bodegas[0]?.id || "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, company, bodegas]);

  const set = (patch) => onChange?.({ tenantId, company, bodegaId, ...patch });

  return (
    <>
      <Field label="País (tenant)" required>
        <Field.Select
          value={tenantId}
          onChange={(e) => set({ tenantId: e.target.value })}
        >
          <option value="">Seleccioná…</option>
          {TENANT_OPTIONS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} ({t.id})
            </option>
          ))}
        </Field.Select>
      </Field>

      <Field label="Compañía" required>
        <Field.Select
          value={company}
          onChange={(e) => set({ company: e.target.value })}
        >
          {COMPANY_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Field.Select>
      </Field>

      <Field label="Bodega" required>
        <Field.Select
          value={bodegaId}
          onChange={(e) => set({ bodegaId: e.target.value })}
          disabled={!tenantId}
        >
          {!tenantId ? <option value="">Elegí un país primero</option> : null}
          {bodegas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} — {b.id}
            </option>
          ))}
        </Field.Select>
      </Field>
    </>
  );
}
