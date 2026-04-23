import { useMemo } from "react";
import { computeOTsDashboardMetrics } from "./computeOTsDashboardMetrics";

export function useOTsDashboardMetrics(rows, period, customFrom, customTo) {
  return useMemo(
    () =>
      computeOTsDashboardMetrics({
        rows,
        period,
        customFrom,
        customTo,
      }),
    [rows, period, customFrom, customTo]
  );
}

