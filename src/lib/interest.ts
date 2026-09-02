import { differenceInCalendarDays } from "date-fns";
import type { Compounding } from "@/db/schema";
import { fromIso, type IsoDate } from "./periods";
import type { Cents } from "./money";

export const COMPOUNDING_LABELS: Record<Compounding, string> = {
  daily: "Diaria",
  monthly: "Mensual",
  quarterly: "Trimestral",
  annual: "Anual",
};

export function periodsPerYear(compounding: Compounding): number {
  switch (compounding) {
    case "daily":
      return 365;
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "annual":
      return 1;
  }
}

export type InterestConfig = {
  /** Tasa anual nominal como fracción: 0.085 = 8.5 % */
  annualRate: number;
  compounding: Compounding;
};

/**
 * Interés compuesto: A = P (1 + r/n)^(n·t)
 *
 * Devuelve el monto final en centavos, redondeado al centavo. La proyección es
 * una estimación: la app nunca la suma sola al saldo, solo la muestra hasta que
 * confirmas el interés que el banco realmente abonó.
 */
export function futureValue(
  principal: Cents,
  { annualRate, compounding }: InterestConfig,
  years: number,
): Cents {
  if (years <= 0 || annualRate <= 0) return principal;
  const n = periodsPerYear(compounding);
  return Math.round(principal * Math.pow(1 + annualRate / n, n * years));
}

/** Solo la parte de interés: el monto final menos el capital. */
export function interestEarned(
  principal: Cents,
  config: InterestConfig,
  years: number,
): Cents {
  return futureValue(principal, config, years) - principal;
}

/**
 * Interés devengado estimado entre dos fechas.
 *
 * Usa el saldo actual como capital, así que es una aproximación: si metiste o
 * sacaste dinero en medio del periodo, el número real difiere. Por eso la UI
 * siempre lo etiqueta como *estimado* y exige confirmación antes de registrarlo.
 */
export function accruedInterest(
  principal: Cents,
  config: InterestConfig,
  from: IsoDate,
  to: IsoDate,
): Cents {
  const days = differenceInCalendarDays(fromIso(to), fromIso(from));
  if (days <= 0) return 0;
  return interestEarned(principal, config, days / 365);
}

export type ProjectionPoint = {
  year: number;
  /** Con intereses */
  withInterest: Cents;
  /** Línea plana de referencia: lo que tendrías sin intereses */
  flat: Cents;
};

/**
 * Serie para la gráfica de proyección. Incluye el año 0 para que la línea
 * arranque en el saldo actual y la comparación contra "sin intereses" sea
 * visible desde el origen.
 */
export function projectionSeries(
  principal: Cents,
  config: InterestConfig,
  years = 10,
): ProjectionPoint[] {
  return Array.from({ length: years + 1 }, (_, year) => ({
    year,
    withInterest: futureValue(principal, config, year),
    flat: principal,
  }));
}

/** Parsea la tasa que viene de Postgres como `numeric` (string) o de un form. */
export function parseRate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 0.085 → "8.5 %" */
export function formatRate(rate: number, locale = "es-MX"): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rate);
}
