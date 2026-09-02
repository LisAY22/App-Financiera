import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";

/**
 * Agrupación temporal de todo el análisis.
 *
 * La semana arranca en lunes para coincidir con `date_trunc('week', ...)` de
 * Postgres. Si JS y SQL discreparan aquí, las etiquetas del eje dirían una cosa
 * y los totales otra.
 */
export type Granularity = "week" | "month" | "year";

export const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "year", label: "Año" },
];

/** Fecha civil 'YYYY-MM-DD'. Nunca un instante con zona horaria. */
export type IsoDate = string;

export type DateRange = { from: IsoDate; to: IsoDate };

export const RANGE_PRESETS = [
  "this-month",
  "last-3-months",
  "last-6-months",
  "last-12-months",
  "this-year",
  "all",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  "this-month": "Este mes",
  "last-3-months": "Últimos 3 meses",
  "last-6-months": "Últimos 6 meses",
  "last-12-months": "Últimos 12 meses",
  "this-year": "Este año",
  all: "Todo",
};

const WEEK_OPTS = { weekStartsOn: 1 as const };

export function toIso(date: Date): IsoDate {
  return format(date, "yyyy-MM-dd");
}

export function fromIso(date: IsoDate): Date {
  return parseISO(date);
}

export function todayIso(): IsoDate {
  return toIso(new Date());
}

/**
 * Convierte un preset en fechas concretas. `all` arranca en una fecha muy
 * anterior a cualquier movimiento real en vez de en `null`, para que el resto
 * del código no tenga que tratar un caso especial de rango abierto.
 */
export function resolveRange(preset: RangePreset, reference = new Date()): DateRange {
  switch (preset) {
    case "this-month":
      return { from: toIso(startOfMonth(reference)), to: toIso(endOfMonth(reference)) };
    case "last-3-months":
      return {
        from: toIso(startOfMonth(subMonths(reference, 2))),
        to: toIso(endOfMonth(reference)),
      };
    case "last-6-months":
      return {
        from: toIso(startOfMonth(subMonths(reference, 5))),
        to: toIso(endOfMonth(reference)),
      };
    case "last-12-months":
      return {
        from: toIso(startOfMonth(subMonths(reference, 11))),
        to: toIso(endOfMonth(reference)),
      };
    case "this-year":
      return { from: toIso(startOfYear(reference)), to: toIso(endOfYear(reference)) };
    case "all":
      return { from: "1970-01-01", to: toIso(endOfYear(reference)) };
  }
}

/**
 * El rango inmediatamente anterior, de la misma longitud, para comparar
 * "este periodo vs. el anterior". Se mide en días para que meses de distinta
 * duración no produzcan comparaciones desalineadas.
 */
export function previousRange(range: DateRange): DateRange {
  const from = fromIso(range.from);
  const to = fromIso(range.to);
  const days = differenceInCalendarDays(to, from) + 1;
  return { from: toIso(addDays(from, -days)), to: toIso(addDays(to, -days)) };
}

/** Primer día del bucket al que pertenece una fecha. Igual que `date_trunc`. */
export function bucketStart(date: Date, granularity: Granularity): Date {
  switch (granularity) {
    case "week":
      return startOfWeek(date, WEEK_OPTS);
    case "month":
      return startOfMonth(date);
    case "year":
      return startOfYear(date);
  }
}

/** Clave estable de bucket: el 'YYYY-MM-DD' de su primer día. */
export function bucketKey(date: IsoDate | Date, granularity: Granularity): IsoDate {
  const d = typeof date === "string" ? fromIso(date) : date;
  return toIso(bucketStart(d, granularity));
}

/**
 * Todos los buckets del rango, incluidos los vacíos.
 *
 * Sin esto, un mes sin movimientos simplemente desaparecería del eje y la
 * gráfica mentiría: un hueco se leería como continuidad.
 */
export function enumerateBuckets(range: DateRange, granularity: Granularity): IsoDate[] {
  const end = fromIso(range.to);
  let cursor = bucketStart(fromIso(range.from), granularity);
  const keys: IsoDate[] = [];

  // Tope de seguridad por si llega un rango absurdo ('all' con granularidad semanal).
  const MAX_BUCKETS = 600;

  while (cursor <= end && keys.length < MAX_BUCKETS) {
    keys.push(toIso(cursor));
    cursor =
      granularity === "week"
        ? addWeeks(cursor, 1)
        : granularity === "month"
          ? addMonths(cursor, 1)
          : addYears(cursor, 1);
  }
  return keys;
}

/** Etiqueta corta para el eje: cabe en un teléfono. */
export function formatBucketLabel(key: IsoDate, granularity: Granularity): string {
  const d = fromIso(key);
  switch (granularity) {
    case "week":
      return format(d, "d MMM", { locale: es });
    case "month":
      return format(d, "MMM yy", { locale: es });
    case "year":
      return format(d, "yyyy");
  }
}

/** Etiqueta larga para tooltips y encabezados, donde sí hay espacio. */
export function formatBucketFull(key: IsoDate, granularity: Granularity): string {
  const d = fromIso(key);
  switch (granularity) {
    case "week": {
      const end = endOfWeek(d, WEEK_OPTS);
      return `${format(d, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;
    }
    case "month":
      return format(d, "MMMM yyyy", { locale: es });
    case "year":
      return format(d, "yyyy");
  }
}

export function formatDateLabel(date: IsoDate): string {
  return format(fromIso(date), "d MMM yyyy", { locale: es });
}

/** Granularidad sensata para un rango dado, como valor inicial del selector. */
export function defaultGranularity(range: DateRange): Granularity {
  const days = differenceInCalendarDays(fromIso(range.to), fromIso(range.from));
  if (days <= 62) return "week";
  if (days <= 366 * 3) return "month";
  return "year";
}

export function isGranularity(value: unknown): value is Granularity {
  return value === "week" || value === "month" || value === "year";
}

export function isRangePreset(value: unknown): value is RangePreset {
  return RANGE_PRESETS.includes(value as RangePreset);
}
