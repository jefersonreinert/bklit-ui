"use client";

import { useChart } from "@bklitui/ui/charts";
import { useEffect } from "react";

export interface StatCardHoverState {
  value: number | null;
  label: string | null;
}

/** Syncs the hovered sparkline point into the KPI card headline. */
export function StatCardHoverBridge({
  dataKey,
  formatLabel,
  onHoverChange,
}: {
  dataKey: string;
  formatLabel: (date: Date) => string;
  onHoverChange: (state: StatCardHoverState) => void;
}) {
  const { tooltipData } = useChart();

  useEffect(() => {
    const point = tooltipData?.point;
    if (!point) {
      onHoverChange({ value: null, label: null });
      return;
    }
    const raw = point[dataKey];
    const date = point.date instanceof Date ? point.date : null;
    onHoverChange({
      value: typeof raw === "number" ? raw : null,
      label: date ? formatLabel(date) : null,
    });
  }, [dataKey, formatLabel, onHoverChange, tooltipData]);

  return null;
}
