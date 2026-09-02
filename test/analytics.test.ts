import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedUser, USER_ID, type TestDb } from "./helpers/db";
import * as schema from "@/db/schema";

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb,
  rawRows: null as unknown as (query: unknown) => Promise<unknown[]>,
}));

vi.mock("@/db", () => ({
  db: new Proxy({} as Record<string | symbol, unknown>, {
    get(_target, prop) {
      const value = (holder.db as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? value.bind(holder.db) : value;
    },
  }),
  rawRows: (query: unknown) => holder.rawRows(query),
  schema,
}));

const { getCategoryBreakdown, getIncomeExpenseSeries, getKpis } = await import(
  "@/lib/queries/analytics"
);
const { getDebts, getPayoffProjection } = await import("@/lib/queries/debts");
const { getTransactions } = await import("@/lib/queries/transactions");

const ID = {
  banco: "11111111-1111-4111-8111-111111111111",
  efectivo: "22222222-2222-4222-8222-222222222222",
  comida: "33333333-3333-4333-8333-333333333333",
  pagoDeudas: "44444444-4444-4444-8444-444444444444",
  salario: "55555555-5555-4555-8555-555555555555",
  ana: "66666666-6666-4666-8666-666666666666",
  cena: "77777777-7777-4777-8777-777777777777",
  deudaCuenta: "88888888-8888-4888-8888-888888888888",
  deudaNoCuenta: "99999999-9999-4999-8999-999999999999",
};

const MARZO = { from: "2026-03-01", to: "2026-03-31" };
const FEBRERO = { from: "2026-02-01", to: "2026-02-28" };

let db: TestDb;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  holder.db = test.db;
  holder.rawRows = test.rawRows as never;

  await seedUser(db);

  await db.insert(schema.accounts).values([
    { id: ID.banco, userId: USER_ID, name: "Banco", type: "bank", initialBalance: 500_000 },
    { id: ID.efectivo, userId: USER_ID, name: "Efectivo", type: "cash", initialBalance: 0 },
  ]);

  await db.insert(schema.categories).values([
    { id: ID.comida, userId: USER_ID, name: "Comida", kind: "expense" },
    { id: ID.pagoDeudas, userId: USER_ID, name: "Pago de deudas", kind: "expense" },
    { id: ID.salario, userId: USER_ID, name: "Salario", kind: "income" },
  ]);

  await db.insert(schema.people).values([{ id: ID.ana, userId: USER_ID, name: "Ana" }]);

  await db.insert(schema.transactions).values([
    {
      userId: USER_ID,
      type: "income",
      amount: 300_000,
      date: "2026-03-02",
      description: "Sueldo",
      categoryId: ID.salario,
      toAccountId: ID.banco,
    },
    // Gasto compartido: 1000.00 bruto, 600.00 en cuotas → 400.00 neto
    {
      id: ID.cena,
      userId: USER_ID,
      type: "expense",
      amount: 100_000,
      date: "2026-03-10",
      description: "Cena de grupo",
      categoryId: ID.comida,
      fromAccountId: ID.banco,
    },
    // Una transferencia no es ni ingreso ni gasto
    {
      userId: USER_ID,
      type: "transfer",
      amount: 200_000,
      date: "2026-03-12",
      description: "Retiro",
      fromAccountId: ID.banco,
      toAccountId: ID.efectivo,
    },
  ]);

  await db.insert(schema.transactionSplits).values([
    {
      userId: USER_ID,
      transactionId: ID.cena,
      personId: ID.ana,
      amount: 30_000,
      status: "settled",
      settledAccountId: ID.efectivo,
      settledDate: "2026-03-11",
    },
    {
      userId: USER_ID,
      transactionId: ID.cena,
      personId: ID.ana,
      amount: 30_000,
      status: "pending",
    },
  ]);

  await db.insert(schema.debts).values([
    {
      id: ID.deudaCuenta,
      userId: USER_ID,
      creditorName: "Juan",
      description: "Compra no registrada",
      originalAmount: 200_000,
      startDate: "2026-03-01",
      origin: "purchase_untracked",
      countsAsExpense: true,
    },
    {
      id: ID.deudaNoCuenta,
      userId: USER_ID,
      creditorName: "Marta",
      description: "Compra ya registrada",
      originalAmount: 80_000,
      startDate: "2026-03-01",
      origin: "purchase_tracked",
      countsAsExpense: false,
    },
  ]);

  await db.insert(schema.transactions).values([
    // Pago de la deuda que SÍ cuenta como egreso
    {
      userId: USER_ID,
      type: "debt_payment",
      amount: 50_000,
      date: "2026-03-20",
      description: "Pago a Juan",
      categoryId: ID.pagoDeudas,
      fromAccountId: ID.banco,
      debtId: ID.deudaCuenta,
    },
    // Pago de la deuda que NO cuenta (la compra ya se registró en su día)
    {
      userId: USER_ID,
      type: "debt_payment",
      amount: 20_000,
      date: "2026-03-21",
      description: "Pago a Marta",
      categoryId: ID.pagoDeudas,
      fromAccountId: ID.banco,
      debtId: ID.deudaNoCuenta,
    },
  ]);
});

describe("regla 1: el gasto compartido cuenta neto", () => {
  it("cuenta 400 de un gasto de 1000 con 600 en cuotas", async () => {
    const slices = await getCategoryBreakdown(USER_ID, MARZO, FEBRERO, "expense");
    const comida = slices.find((s) => s.name === "Comida");
    expect(comida?.total).toBe(40_000);
  });

  it("no cambia cuando una cuota pendiente pasa a cobrada", async () => {
    const antes = await getCategoryBreakdown(USER_ID, MARZO, FEBRERO, "expense");
    const comidaAntes = antes.find((s) => s.name === "Comida")!.total;

    const pendiente = (await db.select().from(schema.transactionSplits)).find(
      (s) => s.status === "pending",
    )!;

    await db
      .update(schema.transactionSplits)
      .set({
        status: "settled",
        settledAccountId: ID.banco,
        settledDate: "2026-03-25",
      })
      .where(eq(schema.transactionSplits.id, pendiente.id));

    const despues = await getCategoryBreakdown(USER_ID, MARZO, FEBRERO, "expense");
    const comidaDespues = despues.find((s) => s.name === "Comida")!.total;

    // Esta es la propiedad clave: cobrar una cuota mueve saldo, NO reescribe
    // el análisis de un mes que ya pasó.
    expect(comidaDespues).toBe(comidaAntes);
    expect(comidaDespues).toBe(40_000);
  });

  it("la lista de movimientos muestra bruto y neto por separado", async () => {
    const [cena] = await getTransactions(USER_ID, { search: "Cena" });
    expect(cena.amount).toBe(100_000);
    expect(cena.netAmount).toBe(40_000);
    expect(cena.splitCount).toBe(2);
  });
});

describe("regla 2: las transferencias no contaminan el análisis", () => {
  it("no aparecen ni como ingreso ni como egreso", async () => {
    const series = await getIncomeExpenseSeries(USER_ID, MARZO, "month");
    const marzo = series.find((p) => p.bucket === "2026-03-01")!;

    // Ingreso: solo el sueldo. La transferencia de 200000 no suma.
    expect(marzo.income).toBe(300_000);
    // Egreso: 40000 de la cena neta + 50000 del pago que sí cuenta.
    expect(marzo.expense).toBe(90_000);
  });
});

describe("regla 3: los pagos de deuda no se cuentan dos veces", () => {
  it("cuenta el pago solo cuando la compra no se registró antes", async () => {
    const slices = await getCategoryBreakdown(USER_ID, MARZO, FEBRERO, "expense");
    const pagos = slices.find((s) => s.name === "Pago de deudas");

    // Se pagaron 50000 + 20000, pero solo los 50000 de la deuda marcada como
    // `purchase_untracked` cuentan: la otra compra ya se registró en su fecha.
    expect(pagos?.total).toBe(50_000);
  });

  it("ambos pagos sí bajan el saldo restante de su deuda", async () => {
    const deudas = await getDebts(USER_ID);
    const juan = deudas.find((d) => d.creditorName === "Juan")!;
    const marta = deudas.find((d) => d.creditorName === "Marta")!;

    expect(juan.paid).toBe(50_000);
    expect(juan.remaining).toBe(150_000);
    expect(juan.settled).toBe(false);

    expect(marta.paid).toBe(20_000);
    expect(marta.remaining).toBe(60_000);
  });

  it("proyecta cuándo quedas libre a tu ritmo real de pago", async () => {
    const projection = await getPayoffProjection(USER_ID);
    expect(projection.totalRemaining).toBe(210_000);
    expect(projection.monthsToFree).toBeGreaterThan(0);
  });
});

describe("granularidad semana / mes / año", () => {
  it("los tres agrupamientos suman exactamente lo mismo", async () => {
    const rango = { from: "2026-01-01", to: "2026-12-31" };

    const [semana, mes, anio] = await Promise.all([
      getIncomeExpenseSeries(USER_ID, rango, "week"),
      getIncomeExpenseSeries(USER_ID, rango, "month"),
      getIncomeExpenseSeries(USER_ID, rango, "year"),
    ]);

    const sumar = (serie: { income: number; expense: number }[]) => ({
      income: serie.reduce((s, p) => s + p.income, 0),
      expense: serie.reduce((s, p) => s + p.expense, 0),
    });

    expect(sumar(semana)).toEqual(sumar(mes));
    expect(sumar(mes)).toEqual(sumar(anio));
    expect(sumar(anio)).toEqual({ income: 300_000, expense: 90_000 });
  });

  it("agrupa por año en un solo punto", async () => {
    const serie = await getIncomeExpenseSeries(
      USER_ID,
      { from: "2026-01-01", to: "2026-12-31" },
      "year",
    );
    expect(serie).toHaveLength(1);
    expect(serie[0].bucket).toBe("2026-01-01");
  });

  it("incluye los periodos vacíos en cero", async () => {
    const serie = await getIncomeExpenseSeries(
      USER_ID,
      { from: "2026-01-01", to: "2026-04-30" },
      "month",
    );
    expect(serie).toHaveLength(4);
    expect(serie[0]).toMatchObject({ bucket: "2026-01-01", income: 0, expense: 0 });
    expect(serie[2].expense).toBe(90_000);
  });
});

describe("KPIs", () => {
  it("calcula tasa de ahorro y categoría dominante sobre montos netos", async () => {
    const kpis = await getKpis(USER_ID, MARZO, "month");

    expect(kpis.totalIncome).toBe(300_000);
    expect(kpis.totalExpense).toBe(90_000);
    expect(kpis.net).toBe(210_000);
    expect(kpis.savingsRate).toBeCloseTo(70, 5);
    // 50000 del pago de deudas supera los 40000 netos de comida.
    expect(kpis.topCategory?.name).toBe("Pago de deudas");
  });

  it("no divide entre periodos vacíos al promediar", async () => {
    // Un rango de 12 meses con actividad en uno solo debe promediar sobre ese
    // mes, no repartir el gasto entre doce y aparentar que gastas menos.
    const kpis = await getKpis(USER_ID, { from: "2026-01-01", to: "2026-12-31" }, "month");
    expect(kpis.avgExpensePerBucket).toBe(90_000);
  });
});
