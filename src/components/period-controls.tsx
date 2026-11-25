"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  GRANULARITIES,
  type DateRange,
  type Granularity,
  type RangeSelection,
} from "@/lib/periods";
import { RangePicker, type RangeParamUpdate } from "@/components/range-picker";
import { cn } from "@/lib/utils";

/**
 * Los dos controles del análisis: qué periodo miras y cómo se agrupa.
 *
 * Viven en la URL, no en estado local, por tres razones: puedes volver a un
 * análisis con el botón de atrás, compartir el enlace tal cual, y el servidor
 * recalcula con los mismos parámetros sin un viaje extra.
 */
export function PeriodControls({
  selection,
  range,
  granularity,
  className,
}: {
  selection: RangeSelection;
  range: DateRange;
  granularity: Granularity;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParams = useCallback(
    (update: RangeParamUpdate & { agrupar?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(update)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <RangePicker selection={selection} range={range} onChange={setParams} size="sm" />

      {/* Segmentado en vez de menú: son tres opciones y se cambian a menudo. */}
      <div
        role="group"
        aria-label="Agrupar por"
        className="inline-flex rounded-lg border border-border bg-card p-0.5"
      >
        {GRANULARITIES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={granularity === value}
            onClick={() => setParams({ agrupar: value })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              granularity === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
