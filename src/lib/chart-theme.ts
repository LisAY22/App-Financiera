/**
 * Paleta de gráficas, definida UNA sola vez.
 *
 * Los ocho slots categóricos están validados con el script de la metodología
 * dataviz contra las superficies reales de esta app (#fdfcff claro / #211d2e
 * oscuro): banda de luminosidad, piso de croma, separación bajo protanopía y
 * deuteranopía, piso de visión normal y contraste. Ambos modos pasan.
 *
 * DOS REGLAS QUE NO SE ROMPEN:
 *
 * 1. Los slots se asignan en orden fijo y NUNCA se ciclan. El noveno elemento
 *    no genera un color nuevo: se pliega en "Otras". El orden es el mecanismo
 *    de seguridad para daltonismo, no una decisión estética.
 *
 * 2. Los colores semánticos (ingreso, egreso, transferencia, deuda) están
 *    reservados y nunca se usan como "serie N". Codifican dirección y estado,
 *    y siempre viajan con signo o icono, nunca solos.
 *
 * Aviso heredado de la validación: en modo claro tres slots quedan bajo 3:1
 * contra la superficie. La regla de alivio obliga a que toda gráfica
 * categórica lleve etiquetas visibles o su tabla de valores al lado.
 */

export const CATEGORICAL_SLOTS = 8;

/** Referencias a los tokens CSS, para que el tema claro/oscuro cambie solo. */
export const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

/**
 * Color por posición en el orden fijo. Un índice más allá del octavo slot
 * devuelve el gris neutro de "Otras" en vez de reciclar un color, para que dos
 * series distintas nunca compartan identidad visual.
 */
export function seriesColor(index: number): string {
  return index < CATEGORICAL_SLOTS ? chartColors[index] : "var(--transfer)";
}

export const semanticColors = {
  income: "var(--income)",
  expense: "var(--expense)",
  transfer: "var(--transfer)",
  debt: "var(--debt)",
} as const;

export const chartChrome = {
  grid: "var(--grid)",
  axis: "var(--axis)",
  ink: "var(--muted-foreground)",
  surface: "var(--card)",
} as const;

/** Ejes y rejilla recesivos: los datos mandan, el cromo acompaña. */
export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
} as const;

export const gridProps = {
  stroke: "var(--grid)",
  strokeDasharray: "0",
  vertical: false,
} as const;
