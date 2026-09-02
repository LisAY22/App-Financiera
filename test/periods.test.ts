import { describe, expect, it } from "vitest";
import {
  bucketKey,
  enumerateBuckets,
  previousRange,
  resolveRange,
} from "@/lib/periods";

describe("bucketKey", () => {
  it("agrupa la semana empezando en lunes, igual que date_trunc de Postgres", () => {
    // 2026-03-18 es miércoles; su semana arranca el lunes 16.
    expect(bucketKey("2026-03-18", "week")).toBe("2026-03-16");
    expect(bucketKey("2026-03-16", "week")).toBe("2026-03-16");
    // El domingo 22 todavía pertenece a esa misma semana.
    expect(bucketKey("2026-03-22", "week")).toBe("2026-03-16");
    // El lunes 23 ya es la siguiente.
    expect(bucketKey("2026-03-23", "week")).toBe("2026-03-23");
  });

  it("coloca los bordes de mes y de año en el bucket correcto", () => {
    expect(bucketKey("2026-01-31", "month")).toBe("2026-01-01");
    expect(bucketKey("2026-02-01", "month")).toBe("2026-02-01");
    expect(bucketKey("2026-12-31", "year")).toBe("2026-01-01");
    expect(bucketKey("2027-01-01", "year")).toBe("2027-01-01");
  });

  it("mantiene junta una semana partida entre dos meses", () => {
    // La semana del lunes 2026-03-30 abarca hasta el domingo 2026-04-05.
    expect(bucketKey("2026-03-31", "week")).toBe("2026-03-30");
    expect(bucketKey("2026-04-01", "week")).toBe("2026-03-30");
    expect(bucketKey("2026-04-05", "week")).toBe("2026-03-30");
  });

  it("mantiene junta una semana partida entre dos años", () => {
    // 2026-12-31 es jueves; su semana arranca el lunes 2026-12-28.
    expect(bucketKey("2026-12-31", "week")).toBe("2026-12-28");
    expect(bucketKey("2027-01-01", "week")).toBe("2026-12-28");
  });
});

describe("enumerateBuckets", () => {
  it("incluye los periodos vacíos para que el eje no mienta", () => {
    const buckets = enumerateBuckets({ from: "2026-01-01", to: "2026-04-30" }, "month");
    expect(buckets).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
  });

  it("cubre el rango completo en las tres granularidades", () => {
    const range = { from: "2026-01-01", to: "2026-12-31" };
    expect(enumerateBuckets(range, "year")).toEqual(["2026-01-01"]);
    expect(enumerateBuckets(range, "month")).toHaveLength(12);
    // 2026 tiene 53 lunes contando el que arranca la semana del 1 de enero.
    expect(enumerateBuckets(range, "week").length).toBeGreaterThanOrEqual(52);
  });

  it("no se desborda con un rango absurdo", () => {
    const buckets = enumerateBuckets({ from: "1970-01-01", to: "2026-12-31" }, "week");
    expect(buckets.length).toBeLessThanOrEqual(600);
  });
});

describe("resolveRange y previousRange", () => {
  const reference = new Date("2026-03-15T12:00:00Z");

  it("acota el mes actual a sus propios límites", () => {
    expect(resolveRange("this-month", reference)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("cuenta el mes actual dentro de 'últimos 3 meses'", () => {
    expect(resolveRange("last-3-months", reference)).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
  });

  it("da un periodo anterior de la misma longitud, sin traslape", () => {
    const current = { from: "2026-03-01", to: "2026-03-31" };
    const previous = previousRange(current);
    expect(previous).toEqual({ from: "2026-01-29", to: "2026-02-28" });
    expect(previous.to < current.from).toBe(true);
  });
});
