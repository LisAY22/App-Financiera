import { describe, expect, it } from "vitest";
import {
  accruedInterest,
  futureValue,
  interestEarned,
  periodsPerYear,
  projectionSeries,
} from "@/lib/interest";

describe("futureValue", () => {
  it("coincide con el cálculo a mano en capitalización anual", () => {
    // 1000.00 al 10 % anual, capitalizado una vez al año, durante 2 años:
    // 1000 * 1.1^2 = 1210.00
    expect(futureValue(100000, { annualRate: 0.1, compounding: "annual" }, 2)).toBe(121000);
  });

  it("coincide con el cálculo a mano en capitalización mensual", () => {
    // 1000.00 al 12 % anual capitalizado mensual durante 1 año:
    // 1000 * (1 + 0.12/12)^12 = 1126.825...
    const result = futureValue(100000, { annualRate: 0.12, compounding: "monthly" }, 1);
    expect(result).toBe(Math.round(100000 * Math.pow(1.01, 12)));
    expect(result).toBe(112683);
  });

  it("capitaliza más seguido produce más dinero, con la misma tasa nominal", () => {
    const config = { annualRate: 0.1 } as const;
    const anual = futureValue(100000, { ...config, compounding: "annual" }, 1);
    const mensual = futureValue(100000, { ...config, compounding: "monthly" }, 1);
    const diaria = futureValue(100000, { ...config, compounding: "daily" }, 1);
    expect(mensual).toBeGreaterThan(anual);
    expect(diaria).toBeGreaterThan(mensual);
  });

  it("no inventa dinero cuando no hay tasa o no ha pasado tiempo", () => {
    expect(futureValue(100000, { annualRate: 0, compounding: "monthly" }, 5)).toBe(100000);
    expect(futureValue(100000, { annualRate: 0.1, compounding: "monthly" }, 0)).toBe(100000);
  });
});

describe("periodsPerYear", () => {
  it("usa los periodos convencionales", () => {
    expect(periodsPerYear("daily")).toBe(365);
    expect(periodsPerYear("monthly")).toBe(12);
    expect(periodsPerYear("quarterly")).toBe(4);
    expect(periodsPerYear("annual")).toBe(1);
  });
});

describe("interestEarned", () => {
  it("devuelve solo la parte de interés, sin el capital", () => {
    expect(interestEarned(100000, { annualRate: 0.1, compounding: "annual" }, 1)).toBe(10000);
  });
});

describe("accruedInterest", () => {
  it("devengado en un año completo equivale al interés de un año", () => {
    const config = { annualRate: 0.1, compounding: "annual" } as const;
    // 2025 no es bisiesto: exactamente 365 días.
    const accrued = accruedInterest(100000, config, "2025-01-01", "2026-01-01");
    expect(accrued).toBe(interestEarned(100000, config, 1));
  });

  it("es cero si la fecha final no es posterior a la inicial", () => {
    const config = { annualRate: 0.1, compounding: "monthly" } as const;
    expect(accruedInterest(100000, config, "2026-03-01", "2026-03-01")).toBe(0);
    expect(accruedInterest(100000, config, "2026-03-10", "2026-03-01")).toBe(0);
  });

  it("crece con el tiempo transcurrido", () => {
    const config = { annualRate: 0.08, compounding: "monthly" } as const;
    const seisMeses = accruedInterest(500000, config, "2026-01-01", "2026-07-01");
    const unAno = accruedInterest(500000, config, "2026-01-01", "2027-01-01");
    expect(unAno).toBeGreaterThan(seisMeses);
    expect(seisMeses).toBeGreaterThan(0);
  });
});

describe("projectionSeries", () => {
  it("arranca en el saldo actual y compara contra no tener intereses", () => {
    const series = projectionSeries(100000, { annualRate: 0.1, compounding: "annual" }, 3);
    expect(series).toHaveLength(4);
    expect(series[0]).toEqual({ year: 0, withInterest: 100000, flat: 100000 });
    expect(series[3].withInterest).toBe(133100);
    // La línea plana no se mueve: es justo el punto de la comparación.
    expect(series.every((p) => p.flat === 100000)).toBe(true);
  });
});
