import "server-only";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  accounts,
  categories,
  debts,
  people,
  transactions,
  transactionSplits,
} from "@/db/schema";
import type { SplitStatus, TransactionType } from "@/db/schema";
import type { Cents } from "@/lib/money";
import type { IsoDate } from "@/lib/periods";

/**
 * Monto neto de un movimiento: lo bruto menos lo que otras personas cubren.
 *
 * Un gasto de 1000 con dos cuotas de 300 salió de tu cuenta por 1000 (eso es lo
 * que ve el saldo) pero te costó 400 (eso es lo que ve el análisis). Esta
 * expresión es la traducción entre ambas verdades.
 */
const OUTER_TX_ID = sql.raw('"transactions"."id"');

const netAmountExpression = sql<number>`(
  ${transactions.amount} - COALESCE((
    SELECT SUM(s.amount) FROM ${transactionSplits} s
    WHERE s.transaction_id = ${OUTER_TX_ID}
  ), 0)
)`;

export type TransactionListItem = {
  id: string;
  type: TransactionType;
  amount: Cents;
  netAmount: Cents;
  date: IsoDate;
  description: string;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  debtId: string | null;
  debtDescription: string | null;
  splitCount: number;
};

export type TransactionFilters = {
  from?: IsoDate;
  to?: IsoDate;
  types?: TransactionType[];
  categoryIds?: string[];
  accountIds?: string[];
  search?: string;
};

// Un movimiento puede tocar dos cuentas a la vez (una transferencia sale de una
// y entra a otra), así que la tabla se une dos veces con alias distintos.
const fromAccounts = alias(accounts, "from_acc");
const toAccounts = alias(accounts, "to_acc");

function buildWhere(userId: string, filters: TransactionFilters): SQL {
  const clauses: (SQL | undefined)[] = [eq(transactions.userId, userId)];

  if (filters.from) clauses.push(gte(transactions.date, filters.from));
  if (filters.to) clauses.push(lte(transactions.date, filters.to));
  if (filters.types?.length) clauses.push(inArray(transactions.type, filters.types));
  if (filters.categoryIds?.length) {
    clauses.push(inArray(transactions.categoryId, filters.categoryIds));
  }
  if (filters.accountIds?.length) {
    clauses.push(
      or(
        inArray(transactions.fromAccountId, filters.accountIds),
        inArray(transactions.toAccountId, filters.accountIds),
      ),
    );
  }
  if (filters.search?.trim()) {
    clauses.push(ilike(transactions.description, `%${filters.search.trim()}%`));
  }

  return and(...clauses.filter(Boolean)) as SQL;
}

export async function getTransactions(
  userId: string,
  filters: TransactionFilters = {},
  { limit = 50, offset = 0 } = {},
): Promise<TransactionListItem[]> {
  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      netAmount: netAmountExpression.mapWith(Number),
      date: transactions.date,
      description: transactions.description,
      notes: transactions.notes,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      fromAccountId: transactions.fromAccountId,
      toAccountId: transactions.toAccountId,
      debtId: transactions.debtId,
      debtDescription: debts.description,
      splitCount: sql<number>`(
        SELECT COUNT(*) FROM ${transactionSplits} s
        WHERE s.transaction_id = ${OUTER_TX_ID}
      )`.mapWith(Number),
      fromAccountName: fromAccounts.name,
      toAccountName: toAccounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(debts, eq(debts.id, transactions.debtId))
    .leftJoin(fromAccounts, eq(fromAccounts.id, transactions.fromAccountId))
    .leftJoin(toAccounts, eq(toAccounts.id, transactions.toAccountId))
    .where(buildWhere(userId, filters))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit)
    .offset(offset);

  return rows as TransactionListItem[];
}

export async function countTransactions(
  userId: string,
  filters: TransactionFilters = {},
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(transactions)
    .where(buildWhere(userId, filters));
  return row?.count ?? 0;
}

export type SplitDetail = {
  id: string;
  personId: string;
  personName: string;
  amount: Cents;
  status: SplitStatus;
  settledAccountId: string | null;
  settledAccountName: string | null;
  settledDate: IsoDate | null;
  note: string | null;
};

export async function getTransactionWithSplits(userId: string, transactionId: string) {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, transactionId)))
    .limit(1);

  if (!tx) return null;

  const splits = await db
    .select({
      id: transactionSplits.id,
      personId: transactionSplits.personId,
      personName: people.name,
      amount: transactionSplits.amount,
      status: transactionSplits.status,
      settledAccountId: transactionSplits.settledAccountId,
      settledAccountName: accounts.name,
      settledDate: transactionSplits.settledDate,
      note: transactionSplits.note,
    })
    .from(transactionSplits)
    .innerJoin(people, eq(people.id, transactionSplits.personId))
    .leftJoin(accounts, eq(accounts.id, transactionSplits.settledAccountId))
    .where(eq(transactionSplits.transactionId, transactionId));

  const splitTotal = splits.reduce((s, x) => s + x.amount, 0);

  return {
    ...tx,
    splits: splits as SplitDetail[],
    splitTotal,
    netAmount: tx.amount - splitTotal,
  };
}
