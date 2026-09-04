import "server-only";
import { sql } from "drizzle-orm";
import { rawRows } from "@/db";
import type { Account } from "@/db/schema";
import type { Cents } from "@/lib/money";

/**
 * El saldo NUNCA se guarda materializado: siempre se deriva de los movimientos.
 *
 * Es la decisión que hace imposible desincronizar la app. Editar o borrar un
 * movimiento no puede dejar un saldo obsoleto, porque no existe ningún saldo
 * que actualizar. La fórmula es una sola y vive aquí:
 *
 *   saldo = saldo inicial
 *         + todo lo que ENTRÓ  (to_account_id apunta a la cuenta)
 *         - todo lo que SALIÓ  (from_account_id apunta a la cuenta)
 *         + cuotas ya cobradas que aterrizaron en la cuenta
 *
 * Los cinco tipos de movimiento caben en esa forma, así que agregar tipos
 * nuevos (pagos de deuda, desembolsos) no obligó a tocar este cálculo.
 *
 * OJO CON LAS SUBCONSULTAS CORRELACIONADAS: se escriben en SQL explícito con
 * la tabla calificada (`a.id`, no `id`) a propósito. El constructor de
 * consultas de Drizzle omite el nombre de la tabla cuando el FROM tiene una
 * sola, y dentro de la subconsulta ese `"id"` desnudo resuelve contra
 * `transactions`, no contra `accounts`. La condición deja de cumplirse y el
 * saldo devuelve el inicial: falla en silencio, sin error.
 */
const BALANCE_SQL = sql.raw(`(
  a.initial_balance
  + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.to_account_id = a.id), 0)
  - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.from_account_id = a.id), 0)
  + COALESCE((SELECT SUM(s.amount) FROM transaction_splits s
              WHERE s.settled_account_id = a.id AND s.status = 'settled'), 0)
)`);

const ACCOUNT_COLUMNS = sql.raw(`
  a.id, a.user_id AS "userId", a.name, a.type, a.institution, a.color, a.icon,
  a.initial_balance AS "initialBalance",
  a.interest_enabled AS "interestEnabled",
  a.interest_annual_rate AS "interestAnnualRate",
  a.interest_compounding AS "interestCompounding",
  a.interest_start_date AS "interestStartDate",
  a.sort_order AS "sortOrder", a.archived, a.created_at AS "createdAt"
`);

export type AccountWithBalance = Account & { balance: Cents };

type AccountRow = Omit<Account, "initialBalance"> & {
  initialBalance: string | number;
  balance: string | number;
};

function toAccount(row: AccountRow): AccountWithBalance {
  return {
    ...row,
    initialBalance: Number(row.initialBalance),
    balance: Number(row.balance),
  };
}

export async function getAccountsWithBalances(
  userId: string,
  { includeArchived = false } = {},
): Promise<AccountWithBalance[]> {
  const rows = await rawRows<AccountRow>(sql`
    SELECT ${ACCOUNT_COLUMNS}, ${BALANCE_SQL} AS balance
    FROM accounts a
    WHERE a.user_id = ${userId}
      ${includeArchived ? sql`` : sql`AND a.archived = false`}
    ORDER BY a.sort_order, a.name
  `);

  return rows.map(toAccount);
}

export async function getAccountWithBalance(
  userId: string,
  accountId: string,
): Promise<AccountWithBalance | null> {
  const rows = await rawRows<AccountRow>(sql`
    SELECT ${ACCOUNT_COLUMNS}, ${BALANCE_SQL} AS balance
    FROM accounts a
    WHERE a.user_id = ${userId} AND a.id = ${accountId}
    LIMIT 1
  `);

  return rows[0] ? toAccount(rows[0]) : null;
}

export type NetWorth = {
  /** Suma de todas las cuentas */
  assets: Cents;
  /**
   * Lo que puedes gastar hoy: las cuentas de banco y efectivo.
   *
   * El ahorro queda FUERA aunque sea tuyo y aunque sume al patrimonio. Sacarlo
   * significa romper el ahorro —perder el interés, deshacer el plazo—, así que
   * contarlo como disponible haría creer que tienes margen donde no lo hay. Las
   * deudas tampoco entran: no viven en ninguna cuenta hasta que las pagas.
   */
  liquid: Cents;
  /** Suma de las cuentas de tipo `savings`. Fuera de la liquidez a propósito. */
  savings: Cents;
  /** Suma de lo que falta por pagar de las deudas abiertas */
  debt: Cents;
  /** Activos − deudas */
  net: Cents;
};

/**
 * Patrimonio neto y liquidez. Las deudas restan del neto aquí y solo aquí: en
 * las cuentas no aparecen, porque una deuda no toca ningún saldo hasta que la
 * pagas.
 */
export async function getNetWorth(userId: string): Promise<NetWorth> {
  const [row] = await rawRows<{
    liquid: string | number;
    savings: string | number;
    debt: string | number;
  }>(sql`
    SELECT
      COALESCE((
        SELECT SUM(${BALANCE_SQL})
        FROM accounts a
        WHERE a.user_id = ${userId} AND a.archived = false AND a.type <> 'savings'
      ), 0) AS liquid,
      COALESCE((
        SELECT SUM(${BALANCE_SQL})
        FROM accounts a
        WHERE a.user_id = ${userId} AND a.archived = false AND a.type = 'savings'
      ), 0) AS savings,
      COALESCE((
        SELECT SUM(GREATEST(
          d.original_amount - COALESCE((
            SELECT SUM(t.amount) FROM transactions t
            WHERE t.debt_id = d.id AND t.type = 'debt_payment'
          ), 0), 0))
        FROM debts d
        WHERE d.user_id = ${userId}
      ), 0) AS debt
  `);

  const liquid = Number(row?.liquid ?? 0);
  const savings = Number(row?.savings ?? 0);
  const debt = Number(row?.debt ?? 0);
  const assets = liquid + savings;
  return { assets, liquid, savings, debt, net: assets - debt };
}
