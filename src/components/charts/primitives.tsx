"use client";

import type { ReactNode } from "react";
import { formatBucketFull, type Granularity, type IsoDate } from "@/lib/periods";
import { useMoneyFormatter } from "@/components/settings-provider";
import { cn } from "@/lib/utils";

/* ==================================================================== *
 * Especificaciones fijas de marca (metodología dataviz)
 * ==================================================================== */

/** Barras finas: nunca llenan su carril, el aire sobrante es parte del diseño. */
export const BAR_MAX_SIZE = 24;
/** Extremo del dato redondeado, base cuadrada sobre la línea de cero. */
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export const LINE_WIDTH = 2;
export const DOT_RADIUS = 4;
/** Relleno de área: un lavado, nunca un bloque saturado. */
export const AREA_OPACITY = 0.1;

/** Etiquetas de eje sin decimales y compactas: 1.2 k, 3.4 M. */
export function useAxisFormatter() {
  const format = useMoneyFormatter();
  return (value: number) => format(value, { compact: true, hideZeroCents: true });
}

/* ==================================================================== *
 * Tooltip
 * ==================================================================== */

export type TooltipRow = {
  label: string;
  value: string;
  color?: string;
  emphasis?: boolean;
};

/**
 * Tooltip común a todas las gráficas.
 *
 * El texto siempre va en tokens de tinta; el color de la serie lo lleva el
 * punto que va al lado, nunca la letra. Un amarillo o un aqua categórico son
 * ilegibles como texto sobre la superficie.
 */
export function ChartTooltip({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="pointer-events-none rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-popover-foreground">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {row.color && (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: row.color }}
                />
              )}
              {row.label}
            </span>
            <span
              className={cn(
                "tabular text-popover-foreground",
                row.emphasis && "font-semibold",
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-1.5 border-t border-border pt-1.5">{footer}</div>}
    </div>
  );
}

export function bucketTitle(bucket: IsoDate, granularity: Granularity) {
  return formatBucketFull(bucket, granularity);
}

/* ==================================================================== *
 * Leyenda
 * ==================================================================== */

/**
 * Con dos o más series la leyenda SIEMPRE está presente: es el canal de
 * identidad fiable. Con una sola no se pone, porque el título ya dice qué se
 * está mostrando y una leyenda de un solo elemento solo gasta espacio.
 */
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  if (items.length < 2) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="grid h-full min-h-48 place-items-center text-center">
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
