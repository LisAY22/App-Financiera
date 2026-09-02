/**
 * Todo el dinero de la app vive como ENTEROS EN CENTAVOS.
 *
 * Nunca se guarda ni se opera con floats: 0.1 + 0.2 !== 0.3 en punto flotante, y
 * en una app de finanzas ese error se acumula hasta que los saldos dejan de
 * cuadrar con el banco. Los centavos entran a la base de datos como `bigint` y
 * solo se convierten a texto aquí, en el borde de la UI.
 */

export type Cents = number;

export const DEFAULT_CURRENCY = "USD";
export const DEFAULT_LOCALE = "es-MX";

/** Convierte una cantidad en unidades (12.34) a centavos (1234). */
export function toCents(units: number): Cents {
  return Math.round(units * 100);
}

/** Convierte centavos (1234) a unidades (12.34). Solo para mostrar o graficar. */
export function toUnits(cents: Cents): number {
  return cents / 100;
}

/**
 * Interpreta lo que la persona escribió en un campo de monto.
 *
 * Acepta las formas que realmente se teclean o se pegan: "1234", "1,234.56",
 * "1.234,56", "$ 1 234.56", "-45". Devuelve `null` si no hay un número válido,
 * para que el llamador muestre un error en vez de guardar un cero silencioso.
 */
export function parseMoney(input: string): Cents | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (trimmed === "") return null;

  const negative = /^-/.test(trimmed) || /^\(.*\)$/.test(trimmed);

  // Deja solo dígitos y separadores; fuera símbolos de moneda, espacios y signos.
  const cleaned = trimmed.replace(/[^\d.,]/g, "");
  if (cleaned === "") return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);

  let integerPart: string;
  let fractionPart: string;

  if (lastSep === -1) {
    integerPart = cleaned;
    fractionPart = "";
  } else {
    const decimals = cleaned.length - lastSep - 1;
    // Un separador seguido de 1 o 2 dígitos es la coma decimal; con 3 dígitos
    // (y sin otro separador después) es un separador de miles: "1.234" = 1234.
    if (decimals === 1 || decimals === 2) {
      integerPart = cleaned.slice(0, lastSep);
      fractionPart = cleaned.slice(lastSep + 1);
    } else {
      integerPart = cleaned;
      fractionPart = "";
    }
  }

  const digitsOnly = integerPart.replace(/[.,]/g, "");
  // "1.234,56" y ",50" son válidos; "" con fracción significa "0.50".
  if (digitsOnly === "" && fractionPart === "") return null;

  const whole = digitsOnly === "" ? 0 : Number(digitsOnly);
  const frac = fractionPart === "" ? 0 : Number(fractionPart.padEnd(2, "0").slice(0, 2));

  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return null;

  const cents = whole * 100 + frac;
  return negative ? -cents : cents;
}

export type FormatMoneyOptions = {
  currency?: string;
  locale?: string;
  /** Antepone + o − explícito. Úsalo donde la dirección del dinero importa. */
  signed?: boolean;
  /** Oculta los centavos cuando son .00 (útil en ejes de gráficas). */
  hideZeroCents?: boolean;
  /** Redondea a miles/millones: 1.2 k, 3.4 M. Para etiquetas de eje. */
  compact?: boolean;
};

/**
 * Dónde va el símbolo de la moneda en este idioma: "$1,234.56" o "1.234,56 €".
 *
 * Se deduce del formato estándar, que sí es consistente entre entornos, en vez
 * de confiar en `notation: "compact"` con `style: "currency"`: ahí el ICU de
 * Node y el del navegador colocan el símbolo en lados distintos para varios
 * idiomas, y el servidor renderizaba "13.7 k$" mientras el cliente ponía
 * "$13.7 k". Eso rompe la hidratación de React y repinta el árbol entero.
 */
function currencyAffix(currency: string, locale: string) {
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).formatToParts(1);

  const currencyIndex = parts.findIndex((p) => p.type === "currency");
  const numberIndex = parts.findIndex((p) => p.type === "integer");
  const symbol = parts[currencyIndex]?.value ?? currency;
  const hasSpace = parts.some((p) => p.type === "literal" && p.value.trim() === "");

  return currencyIndex < numberIndex
    ? { prefix: symbol + (hasSpace ? " " : ""), suffix: "" }
    : { prefix: "", suffix: (hasSpace ? " " : "") + symbol };
}

export function formatMoney(cents: Cents, options: FormatMoneyOptions = {}): string {
  const {
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    signed = false,
    hideZeroCents = false,
    compact = false,
  } = options;

  const units = toUnits(Math.abs(cents));
  const showCents = !(hideZeroCents && cents % 100 === 0);

  let formatted: string;

  if (compact) {
    const number = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(units);
    const { prefix, suffix } = currencyAffix(currency, locale);
    formatted = `${prefix}${number}${suffix}`;
  } else {
    formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0,
    }).format(units);
  }

  if (signed && cents !== 0) return `${cents > 0 ? "+" : "−"}${formatted}`;
  if (!signed && cents < 0) return `−${formatted}`;
  return formatted;
}

/** Solo el número, sin símbolo de moneda. Para inputs y celdas densas. */
export function formatAmount(cents: Cents, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toUnits(cents));
}

/**
 * Reparte un total en `n` partes iguales sin perder ni inventar centavos.
 * Los centavos sobrantes se distribuyen de uno en uno entre las primeras
 * partes, así que la suma del resultado siempre es exactamente `total`.
 */
export function splitEvenly(total: Cents, n: number): Cents[] {
  if (n <= 0) return [];
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / n);
  const remainder = abs - base * n;
  return Array.from({ length: n }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

/** Porcentaje seguro: devuelve 0 en vez de NaN/Infinity cuando el total es 0. */
export function percentOf(part: Cents, total: Cents): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}
