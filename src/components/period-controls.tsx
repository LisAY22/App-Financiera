"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  GRANULARITIES,
  RANGE_LABELS,
  RANGE_PRESETS,
  type Granularity,
  type RangePreset,
} from "@/lib/periods";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Los dos controles del análisis: qué periodo miras y cómo se agrupa.
 *
 * Viven en la URL, no en estado local, por tres razones: puedes volver a un
 * análisis con el botón de atrás, compartir el enlace tal cual, y el servidor
 * recalcula con los mismos parámetros sin un viaje extra.
 */
export function PeriodControls({
  range,
  granularity,
  className,
}: {
  range: RangePreset;
  granularity: Granularity;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(key, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/*
        `items` mapea valor → etiqueta. Sin él, Base UI pinta la clave cruda en
        el botón cerrado ("last-6-months" en vez de "Últimos 6 meses").
      */}
      <Select
        items={RANGE_LABELS}
        value={range}
        onValueChange={(v) => setParam("rango", v ?? "this-month")}
      >
        <SelectTrigger size="sm" className="w-auto min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {RANGE_LABELS[preset]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
            onClick={() => setParam("agrupar", value)}
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
