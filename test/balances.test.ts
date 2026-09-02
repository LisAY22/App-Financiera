import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, seedUser, USER_ID, type TestDb } from "./helpers/db";
import * as schema from "@/db/schema";

/**
 * Los módulos de consulta importan `db` desde "@/db", que exige DATABASE_URL y
 * habla con Neon. Aquí se sustituye por la instancia de PGlite para poder
 * ejercitar el SQL de verdad, con sus CHECK y su `date_trunc`.
 */
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

const { getAccountsWithBalances, getNetWorth } = await import("@/lib/queries/balances");

const IDS = {
  banco1: "11111111-1111-4111-8111-111111111111",
  banco2: "22222222-2222-4222-8222-222222222222",
  efectivo: "33333333-3333-4333-8333-333333333333",
  ahorro: "44444444-4444-4444-8444-444444444444",
  comida: "55555555-5555-4555-8555-555555555555",
  salario: "66666666-6666-4666-8666-666666666666",
  ana: "77777777-7777-4777-8777-777777777777",
  gastoCompartido: "88888888-8888-4888-8888-888888888888",
  splitCobrado: "99999999-9999-4999-8999-999999999999",
  splitPendiente: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

let db: TestDb;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  holder.db = test.db;
  holder.rawRows = test.rawRows as never;

  await seedUser(db);

  await db.insert(schema.accounts).values([
    { id: IDS.banco1, userId: USER_ID, name: "Banco 1", type: "bank", initialBalance: 100_000 },
    { id: IDS.banco2, userId: USER_ID, name: "Banco 2", type: "bank", initialBalance: 50_000 },
    { id: IDS.efectivo, userId: USER_ID, name: "Efectivo", type: "cash", initialBalance: 20_000 },
    { id: IDS.ahorro, userId: USER_ID, name: "Ahorro", type: "savings", initialBalance: 200_000 },
  ]);

  await db.insert(schema.categories).values([
    { id: IDS.comida, userId: USER_ID, name: "Comida", kind: "expense" },
    { id: IDS.salario, userId: USER_ID, name: "Salario", kind: "income" },
  ]);

  await db.insert(schema.people).values([{ id: IDS.ana, userId: USER_ID, name: "Ana" }]);

  await db.insert(schema.transactions).values([
    // Ingreso al banco 1
    {
      userId: USER_ID,
      type: "income",
      amount: 30_000,
      date: "2026-03-05",
      description: "Sueldo",
      categoryId: IDS.salario,
      toAccountId: IDS.banco1,
    },
    // Transferencia banco 1 → ahorro (ni ingreso ni egreso)
    {
      userId: USER_ID,
      type: "transfer",
      amount: 50_000,
      date: "2026-03-06",
      description: "A mi ahorro",
      fromAccountId: IDS.banco1,
      toAccountId: IDS.ahorro,
    },
    // Gasto compartido de 1000.00 desde el banco 2
    {
      id: IDS.gastoCompartido,
      userId: USER_ID,
      type: "expense",
      amount: 100_000,
      date: "2026-03-10",
      description: "Cena de grupo",
      categoryId: IDS.comida,
      fromAccountId: IDS.banco2,
    },
  ]);

  await db.insert(schema.transactionSplits).values([
    {
      id: IDS.splitCobrado,
      userId: USER_ID,
      transactionId: IDS.gastoCompartido,
      personId: IDS.ana,
      amount: 30_000,
      status: "settled",
      settledAccountId: IDS.efectivo,
      settledDate: "2026-03-10",
    },
    {
      id: IDS.splitPendiente,
      userId: USER_ID,
      transactionId: IDS.gastoCompartido,
      personId: IDS.ana,
      amount: 30_000,
      status: "pending",
    },
  ]);
});

function balanceOf(list: { id: string; balance: number }[], id: string) {
  return list.find((a) => a.id === id)!.balance;
}

describe("saldos derivados", () => {
  it("aplica ingresos, transferencias, gastos brutos y cuotas cobradas", async () => {
    const list = await getAccountsWithBalances(USER_ID);

    // 100000 inicial + 30000 sueldo − 50000 transferido
    expect(balanceOf(list, IDS.banco1)).toBe(80_000);
    // 50000 inicial − 100000 del gasto BRUTO: de la cuenta salió todo
    expect(balanceOf(list, IDS.banco2)).toBe(-50_000);
    // 20000 inicial + 30000 de la cuota que Ana ya pagó
    expect(balanceOf(list, IDS.efectivo)).toBe(50_000);
    // 200000 inicial + 50000 recibidos de la transferencia
    expect(balanceOf(list, IDS.ahorro)).toBe(250_000);
  });

  it("la transferencia mueve saldo entre cuentas pero no cambia el total", async () => {
    const list = await getAccountsWithBalances(USER_ID);
    const total = list.reduce((sum, a) => sum + a.balance, 0);

    // 370000 de saldos iniciales + 30000 de ingreso − 100000 de gasto
    // + 30000 de la cuota cobrada. La transferencia no aparece en la cuenta.
    expect(total).toBe(330_000);
  });

  it("descuenta las deudas propias solo del patrimonio neto", async () => {
    const antes = await getNetWorth(USER_ID);
    expect(antes.assets).toBe(330_000);
    expect(antes.debt).toBe(0);
    expect(antes.net).toBe(330_000);

    await db.insert(schema.debts).values({
      userId: USER_ID,
      creditorName: "Juan",
      description: "Préstamo",
      originalAmount: 200_000,
      startDate: "2026-03-01",
      origin: "purchase_untracked",
      countsAsExpense: true,
    });

    const despues = await getNetWorth(USER_ID);
    // Crear la deuda no toca ningún saldo de cuenta...
    expect(despues.assets).toBe(330_000);
    // ...pero sí baja el patrimonio neto.
    expect(despues.debt).toBe(200_000);
    expect(despues.net).toBe(130_000);
  });
});

describe("integridad del esquema", () => {
  it("rechaza una transferencia con categoría", async () => {
    await expect(
      db.insert(schema.transactions).values({
        userId: USER_ID,
        type: "transfer",
        amount: 1000,
        date: "2026-03-11",
        description: "inválida",
        categoryId: IDS.comida,
        fromAccountId: IDS.banco1,
        toAccountId: IDS.banco2,
      }),
    ).rejects.toThrow();
  });

  it("rechaza un ingreso sin cuenta destino", async () => {
    await expect(
      db.insert(schema.transactions).values({
        userId: USER_ID,
        type: "income",
        amount: 1000,
        date: "2026-03-11",
        description: "inválida",
        categoryId: IDS.salario,
        fromAccountId: IDS.banco1,
      }),
    ).rejects.toThrow();
  });

  it("rechaza una transferencia de una cuenta a sí misma", async () => {
    await expect(
      db.insert(schema.transactions).values({
        userId: USER_ID,
        type: "transfer",
        amount: 1000,
        date: "2026-03-11",
        description: "inválida",
        fromAccountId: IDS.banco1,
        toAccountId: IDS.banco1,
      }),
    ).rejects.toThrow();
  });

  it("rechaza una cuota marcada como cobrada sin cuenta destino", async () => {
    await expect(
      db.insert(schema.transactionSplits).values({
        userId: USER_ID,
        transactionId: IDS.gastoCompartido,
        personId: IDS.ana,
        amount: 1000,
        status: "settled",
      }),
    ).rejects.toThrow();
  });

  it("rechaza montos negativos o cero", async () => {
    await expect(
      db.insert(schema.transactions).values({
        userId: USER_ID,
        type: "expense",
        amount: -500,
        date: "2026-03-11",
        description: "inválida",
        categoryId: IDS.comida,
        fromAccountId: IDS.banco1,
      }),
    ).rejects.toThrow();
  });
});
