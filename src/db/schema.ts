import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

/* ------------------------------------------------------------------ *
 * Auth.js
 *
 * Mismas columnas que espera el adaptador de Drizzle, con nombres de tabla
 * prefijados `auth_` para no chocar con `accounts`, que aquí significa
 * "cuenta de banco/efectivo/ahorro", no "cuenta de proveedor OAuth".
 * ------------------------------------------------------------------ */

export const authUsers = pgTable("auth_users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ------------------------------------------------------------------ *
 * Enums de dominio
 * ------------------------------------------------------------------ */

export const accountTypeEnum = pgEnum("account_type", ["bank", "cash", "savings"]);
export const compoundingEnum = pgEnum("compounding", [
  "daily",
  "monthly",
  "quarterly",
  "annual",
]);
export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);

/**
 * Los cinco tipos de movimiento. `transfer`, `debt_payment` y `debt_disbursement`
 * existen precisamente para que mover dinero NO se confunda con ganarlo o
 * gastarlo: el análisis filtra por este campo, no por heurísticas.
 */
export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
  "debt_payment",
  "debt_disbursement",
]);

export const splitStatusEnum = pgEnum("split_status", ["pending", "settled"]);

/**
 * Cómo nació una deuda. De aquí sale `counts_as_expense`, la regla que impide
 * contar el mismo dinero dos veces (una al comprar y otra al pagar la deuda).
 */
export const debtOriginEnum = pgEnum("debt_origin", [
  "purchase_untracked", // compraste algo y NO lo registraste como gasto
  "purchase_tracked", // ya lo registraste como gasto en su fecha
  "cash_loan", // te prestaron dinero que entró a tu cuenta
]);

/* ------------------------------------------------------------------ *
 * Configuración por persona
 * ------------------------------------------------------------------ */

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("USD"),
  locale: text("locale").notNull().default("es-MX"),
  seededAt: timestamp("seeded_at", { withTimezone: true, mode: "date" }),
});

/* ------------------------------------------------------------------ *
 * Cuentas: bancos, efectivo, ahorro
 * ------------------------------------------------------------------ */

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    institution: text("institution"),
    color: text("color"),
    icon: text("icon"),
    /** Saldo con el que arrancaste a usar la app, en centavos. */
    initialBalance: bigint("initial_balance", { mode: "number" }).notNull().default(0),

    // Solo relevante para type = 'savings'
    interestEnabled: boolean("interest_enabled").notNull().default(false),
    /** Tasa anual nominal como fracción: 0.0850 = 8.5 % */
    interestAnnualRate: numeric("interest_annual_rate", { precision: 7, scale: 4 }),
    interestCompounding: compoundingEnum("interest_compounding"),
    interestStartDate: date("interest_start_date", { mode: "string" }),

    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    check("accounts_rate_range", sql`${t.interestAnnualRate} IS NULL OR (${t.interestAnnualRate} >= 0 AND ${t.interestAnnualRate} <= 1)`),
  ],
);

/* ------------------------------------------------------------------ *
 * Categorías
 * ------------------------------------------------------------------ */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: categoryKindEnum("kind").notNull(),
    color: text("color"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("categories_user_idx").on(t.userId, t.kind),
    uniqueIndex("categories_user_name_kind_idx").on(t.userId, t.kind, t.name),
  ],
);

/* ------------------------------------------------------------------ *
 * Personas (quienes te reembolsan y a quienes les debes)
 * ------------------------------------------------------------------ */

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("people_user_name_idx").on(t.userId, t.name)],
);

/* ------------------------------------------------------------------ *
 * Deudas propias
 *
 * Una deuda NO toca ningún saldo al crearse: existe y se ve, y solo mueve
 * dinero cuando registras un pago. Su estado (pagado / restante) siempre se
 * deriva de los movimientos, nunca se guarda materializado.
 * ------------------------------------------------------------------ */

export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    creditorPersonId: uuid("creditor_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    creditorName: text("creditor_name").notNull(),
    description: text("description").notNull(),
    originalAmount: bigint("original_amount", { mode: "number" }).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
    origin: debtOriginEnum("origin").notNull().default("purchase_untracked"),
    /**
     * Se deriva de `origin` en la capa de aplicación y se persiste para que
     * las consultas de análisis puedan filtrar sin un JOIN extra. Nunca se
     * edita a mano desde la UI.
     */
    countsAsExpense: boolean("counts_as_expense").notNull().default(true),
    /** Columna lista para intereses/mora; sin UI en v1. */
    interestAnnualRate: numeric("interest_annual_rate", { precision: 7, scale: 4 }),
    /** Gasto que originó la deuda, cuando el detector de duplicados lo vinculó. */
    originTransactionId: uuid("origin_transaction_id"),
    color: text("color"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("debts_user_idx").on(t.userId),
    check("debts_amount_positive", sql`${t.originalAmount} > 0`),
  ],
);

/* ------------------------------------------------------------------ *
 * Movimientos: el núcleo
 * ------------------------------------------------------------------ */

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: transactionTypeEnum("type").notNull(),
    /** SIEMPRE positivo y SIEMPRE bruto. La dirección la da `type`. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /**
     * Fecha civil, no instante. `mode: "string"` guarda 'YYYY-MM-DD' tal cual y
     * evita el clásico corrimiento de un día al serializar con zona horaria.
     */
    date: date("date", { mode: "string" }).notNull(),
    description: text("description").notNull().default(""),
    notes: text("notes"),
    /**
     * Obligatoria en ingresos, egresos y pagos de deuda; nula en transferencias
     * y desembolsos, que por definición no son ni ingreso ni gasto.
     *
     * Un pago de deuda SÍ lleva categoría (por defecto "Pago de deudas") aunque
     * `counts_as_expense` sea falso: así el desglose por categoría funciona por
     * el camino normal, sin categorías sintéticas inventadas en el análisis.
     */
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    fromAccountId: uuid("from_account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    toAccountId: uuid("to_account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    debtId: uuid("debt_id").references(() => debts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_from_account_idx").on(t.fromAccountId),
    index("transactions_to_account_idx").on(t.toAccountId),
    index("transactions_debt_idx").on(t.debtId),
    check("transactions_amount_positive", sql`${t.amount} > 0`),
    /*
      La forma de cada tipo se garantiza en la base de datos, no solo en el
      formulario. Un ingreso sin destino o una transferencia con categoría no
      pueden existir aunque un bug los intente insertar.
    */
    check(
      "transactions_shape",
      sql`
        (${t.type} = 'income'
          AND ${t.fromAccountId} IS NULL AND ${t.toAccountId} IS NOT NULL
          AND ${t.categoryId} IS NOT NULL AND ${t.debtId} IS NULL)
     OR (${t.type} = 'expense'
          AND ${t.fromAccountId} IS NOT NULL AND ${t.toAccountId} IS NULL
          AND ${t.categoryId} IS NOT NULL AND ${t.debtId} IS NULL)
     OR (${t.type} = 'transfer'
          AND ${t.fromAccountId} IS NOT NULL AND ${t.toAccountId} IS NOT NULL
          AND ${t.fromAccountId} <> ${t.toAccountId}
          AND ${t.categoryId} IS NULL AND ${t.debtId} IS NULL)
     OR (${t.type} = 'debt_payment'
          AND ${t.fromAccountId} IS NOT NULL AND ${t.toAccountId} IS NULL
          AND ${t.categoryId} IS NOT NULL AND ${t.debtId} IS NOT NULL)
     OR (${t.type} = 'debt_disbursement'
          AND ${t.fromAccountId} IS NULL AND ${t.toAccountId} IS NOT NULL
          AND ${t.categoryId} IS NULL AND ${t.debtId} IS NOT NULL)
      `,
    ),
  ],
);

/* ------------------------------------------------------------------ *
 * Cuotas de otras personas sobre un gasto compartido
 *
 * El gasto guarda el monto BRUTO (lo que salió de tu cuenta). Lo que de verdad
 * gastaste es `amount - suma de cuotas`, y eso es lo que ve el análisis desde
 * el momento en que registras el gasto, esté cobrado o no. Cuando una cuota se
 * marca como pagada, el dinero entra a `settled_account_id`.
 * ------------------------------------------------------------------ */

export const transactionSplits = pgTable(
  "transaction_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    status: splitStatusEnum("status").notNull().default("pending"),
    settledAccountId: uuid("settled_account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    settledDate: date("settled_date", { mode: "string" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("splits_user_idx").on(t.userId),
    index("splits_transaction_idx").on(t.transactionId),
    index("splits_person_idx").on(t.personId),
    index("splits_settled_account_idx").on(t.settledAccountId),
    check("splits_amount_positive", sql`${t.amount} > 0`),
    /* Una cuota cobrada tiene que decir a dónde entró el dinero y cuándo. */
    check(
      "splits_settled_shape",
      sql`(${t.status} = 'pending' AND ${t.settledAccountId} IS NULL AND ${t.settledDate} IS NULL)
       OR (${t.status} = 'settled' AND ${t.settledAccountId} IS NOT NULL AND ${t.settledDate} IS NOT NULL)`,
    ),
  ],
);

/* ------------------------------------------------------------------ *
 * Relaciones
 * ------------------------------------------------------------------ */

export const accountsRelations = relations(accounts, ({ many }) => ({
  outgoing: many(transactions, { relationName: "fromAccount" }),
  incoming: many(transactions, { relationName: "toAccount" }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
}));

export const peopleRelations = relations(people, ({ many }) => ({
  splits: many(transactionSplits),
  debts: many(debts),
}));

export const debtsRelations = relations(debts, ({ one, many }) => ({
  creditor: one(people, {
    fields: [debts.creditorPersonId],
    references: [people.id],
  }),
  movements: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  fromAccount: one(accounts, {
    fields: [transactions.fromAccountId],
    references: [accounts.id],
    relationName: "fromAccount",
  }),
  toAccount: one(accounts, {
    fields: [transactions.toAccountId],
    references: [accounts.id],
    relationName: "toAccount",
  }),
  debt: one(debts, {
    fields: [transactions.debtId],
    references: [debts.id],
  }),
  splits: many(transactionSplits),
}));

export const transactionSplitsRelations = relations(transactionSplits, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionSplits.transactionId],
    references: [transactions.id],
  }),
  person: one(people, {
    fields: [transactionSplits.personId],
    references: [people.id],
  }),
  settledAccount: one(accounts, {
    fields: [transactionSplits.settledAccountId],
    references: [accounts.id],
  }),
}));

/* ------------------------------------------------------------------ *
 * Tipos inferidos
 * ------------------------------------------------------------------ */

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type TransactionSplit = typeof transactionSplits.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;

export type AccountType = (typeof accountTypeEnum.enumValues)[number];
export type CategoryKind = (typeof categoryKindEnum.enumValues)[number];
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
export type SplitStatus = (typeof splitStatusEnum.enumValues)[number];
export type DebtOrigin = (typeof debtOriginEnum.enumValues)[number];
export type Compounding = (typeof compoundingEnum.enumValues)[number];
