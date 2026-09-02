import { describe, expect, it } from "vitest";
import {
  formatMoney,
  parseMoney,
  percentOf,
  splitEvenly,
  toCents,
  toUnits,
} from "@/lib/money";

describe("parseMoney", () => {
  it("lee las formas que la gente realmente teclea", () => {
    expect(parseMoney("1234")).toBe(123400);
    expect(parseMoney("12.34")).toBe(1234);
    expect(parseMoney("12,34")).toBe(1234);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("$ 1 234.56")).toBe(123456);
    expect(parseMoney("  99.9  ")).toBe(9990);
  });

  it("trata un separador con tres dígitos como miles, no como decimales", () => {
    // "1.234" es mil doscientos treinta y cuatro, no 1 con 234 centavos.
    expect(parseMoney("1.234")).toBe(123400);
    expect(parseMoney("1,234")).toBe(123400);
  });

  it("reconoce montos negativos", () => {
    expect(parseMoney("-45")).toBe(-4500);
    expect(parseMoney("(45)")).toBe(-4500);
  });

  it("devuelve null en vez de un cero silencioso cuando no hay número", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("$")).toBeNull();
  });

  it("no pierde centavos al ir y volver", () => {
    for (const cents of [1, 99, 100, 12345, 999999, 100000001]) {
      const text = (cents / 100).toFixed(2);
      expect(parseMoney(text)).toBe(cents);
    }
  });

  it("sobrevive a la aritmética que rompería un float", () => {
    // 0.1 + 0.2 !== 0.3 en punto flotante; en centavos sí es exacto.
    const a = parseMoney("0.10")!;
    const b = parseMoney("0.20")!;
    expect(a + b).toBe(parseMoney("0.30"));
  });
});

describe("toCents / toUnits", () => {
  it("redondea al centavo más cercano", () => {
    expect(toCents(12.345)).toBe(1235);
    expect(toCents(12.344)).toBe(1234);
    expect(toUnits(1234)).toBe(12.34);
  });
});

describe("formatMoney", () => {
  it("muestra el signo cuando la dirección del dinero importa", () => {
    expect(formatMoney(1234, { signed: true })).toContain("+");
    expect(formatMoney(-1234, { signed: true })).toContain("−");
    expect(formatMoney(0, { signed: true })).not.toContain("+");
  });

  it("puede ocultar centavos en cero para las etiquetas de eje", () => {
    expect(formatMoney(150000, { hideZeroCents: true })).not.toContain(".00");
    expect(formatMoney(150050, { hideZeroCents: true })).toContain("50");
  });

  it("pone el símbolo del mismo lado en compacto que en estándar", () => {
    // Regresión: con `notation: "compact"` + `style: "currency"`, el ICU de
    // Node y el del navegador colocaban el símbolo en lados distintos
    // ("13.7 k$" contra "$13.7 k"), lo que rompía la hidratación de React.
    for (const [locale, currency] of [
      ["es-MX", "MXN"],
      ["es-CO", "COP"],
      ["es-ES", "EUR"],
      ["en-US", "USD"],
    ] as const) {
      const compact = formatMoney(1370000, { locale, currency, compact: true });
      const standard = formatMoney(1370000, { locale, currency });

      const symbolFirstCompact = /^[^\d]/.test(compact);
      const symbolFirstStandard = /^[^\d]/.test(standard);
      expect(symbolFirstCompact).toBe(symbolFirstStandard);
      expect(compact).toMatch(/\d/);
    }
  });

  it("compacta los montos grandes en las etiquetas de eje", () => {
    const compact = formatMoney(1370000, { locale: "es-MX", currency: "MXN", compact: true });
    expect(compact).toContain("13");
    expect(compact.length).toBeLessThan(12);
  });
});

describe("splitEvenly", () => {
  it("reparte sin perder ni inventar centavos", () => {
    // 10.00 entre 3 no da un número redondo; los centavos sobrantes deben
    // repartirse, no desaparecer.
    const parts = splitEvenly(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("cierra exactamente para cualquier total y número de partes", () => {
    for (const total of [1, 7, 100, 12345, 999999]) {
      for (const n of [2, 3, 4, 7, 11]) {
        expect(splitEvenly(total, n).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("devuelve lista vacía si no hay partes", () => {
    expect(splitEvenly(1000, 0)).toEqual([]);
  });
});

describe("percentOf", () => {
  it("devuelve 0 en vez de NaN cuando el total es cero", () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(500, 0)).toBe(0);
    expect(percentOf(25, 100)).toBe(25);
  });
});
