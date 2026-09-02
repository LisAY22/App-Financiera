import { z } from "zod";
import { parseMoney } from "@/lib/money";

/**
 * Los mismos esquemas validan en el navegador y en el servidor.
 *
 * Las Server Actions son alcanzables por POST directo, no solo desde el
 * formulario, así que validar solo en el cliente no valida nada.
 */

/** Acepta lo que la persona teclea ("1,234.56") y lo convierte a centavos. */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const cents = typeof value === "number" ? Math.round(value * 100) : parseMoney(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Escribe un monto válido" });
      return z.NEVER;
    }
    if (cents <= 0) {
      ctx.addIssue({ code: "custom", message: "El monto debe ser mayor que cero" });
      return z.NEVER;
    }
    return cents;
  });

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (usa AAAA-MM-DD)");

export const accountTypeSchema = z.enum(["bank", "cash", "savings"]);
export const compoundingSchema = z.enum(["daily", "monthly", "quarterly", "annual"]);
export const categoryKindSchema = z.enum(["income", "expense"]);
export const debtOriginSchema = z.enum([
  "purchase_untracked",
  "purchase_tracked",
  "cash_loan",
]);

/* ------------------------------------------------------------------ *
 * Cuentas
 * ------------------------------------------------------------------ */

export const accountSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Ponle un nombre").max(60),
    type: accountTypeSchema,
    institution: z.string().trim().max(60).optional().or(z.literal("")),
    // El saldo inicial sí puede ser cero o negativo (un descubierto).
    initialBalance: z
      .union([z.string(), z.number()])
      .transform((value, ctx) => {
        const cents =
          typeof value === "number" ? Math.round(value * 100) : parseMoney(value);
        if (cents === null) {
          ctx.addIssue({ code: "custom", message: "Escribe un saldo válido" });
          return z.NEVER;
        }
        return cents;
      })
      .default(0),
    color: z.string().optional(),
    interestEnabled: z.boolean().default(false),
    interestAnnualRate: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === "") return null;
        const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        return Number.isFinite(n) ? n / 100 : null;
      }),
    interestCompounding: compoundingSchema.optional().nullable(),
    interestStartDate: isoDateSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.interestEnabled) return;
    if (data.type !== "savings") {
      ctx.addIssue({
        code: "custom",
        path: ["interestEnabled"],
        message: "Los intereses solo aplican a cuentas de ahorro",
      });
    }
    if (data.interestAnnualRate === null || data.interestAnnualRate <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["interestAnnualRate"],
        message: "Escribe la tasa anual",
      });
    }
    if (!data.interestCompounding) {
      ctx.addIssue({
        code: "custom",
        path: ["interestCompounding"],
        message: "Elige cada cuánto capitaliza",
      });
    }
    if (!data.interestStartDate) {
      ctx.addIssue({
        code: "custom",
        path: ["interestStartDate"],
        message: "Indica desde cuándo generan intereses",
      });
    }
  });

/* ------------------------------------------------------------------ *
 * Categorías y personas
 * ------------------------------------------------------------------ */

export const categorySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Ponle un nombre").max(40),
  kind: categoryKindSchema,
  color: z.string().optional(),
  icon: z.string().optional(),
});

export const personSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  color: z.string().optional(),
});

/* ------------------------------------------------------------------ *
 * Movimientos
 * ------------------------------------------------------------------ */

const splitInputSchema = z.object({
  id: z.uuid().optional(),
  personId: z.uuid("Elige a la persona").optional(),
  personName: z.string().trim().max(60).optional(),
  amount: amountSchema,
  settled: z.boolean().default(false),
  settledAccountId: z.uuid().optional().nullable(),
  settledDate: isoDateSchema.optional().nullable(),
});

const baseTransactionSchema = z.object({
  id: z.uuid().optional(),
  amount: amountSchema,
  date: isoDateSchema,
  description: z.string().trim().max(140).default(""),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const incomeSchema = baseTransactionSchema.extend({
  type: z.literal("income"),
  toAccountId: z.uuid("Elige la cuenta destino"),
  categoryId: z.uuid("Elige una categoría"),
});

export const expenseSchema = baseTransactionSchema.extend({
  type: z.literal("expense"),
  fromAccountId: z.uuid("Elige la cuenta de origen"),
  categoryId: z.uuid("Elige una categoría"),
  splits: z.array(splitInputSchema).default([]),
});

export const transferSchema = baseTransactionSchema.extend({
  type: z.literal("transfer"),
  fromAccountId: z.uuid("Elige la cuenta de origen"),
  toAccountId: z.uuid("Elige la cuenta destino"),
});

export const transactionSchema = z
  .discriminatedUnion("type", [incomeSchema, expenseSchema, transferSchema])
  .superRefine((data, ctx) => {
    if (data.type === "transfer" && data.fromAccountId === data.toAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "Elige dos cuentas distintas: una transferencia a sí misma no mueve nada",
      });
    }

    if (data.type !== "expense") return;

    // Las cuotas no pueden sumar más que el gasto: eso convertiría un egreso en
    // una ganancia encubierta y rompería el análisis.
    const splitTotal = data.splits.reduce((sum, s) => sum + s.amount, 0);
    if (splitTotal > data.amount) {
      ctx.addIssue({
        code: "custom",
        path: ["splits"],
        message: "Las cuotas suman más que el gasto total",
      });
    }

    data.splits.forEach((split, i) => {
      if (!split.personId && !split.personName?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["splits", i, "personId"],
          message: "¿Quién te reembolsa?",
        });
      }
      if (split.settled && !split.settledAccountId) {
        ctx.addIssue({
          code: "custom",
          path: ["splits", i, "settledAccountId"],
          message: "¿A qué cuenta te llegó?",
        });
      }
    });
  });

export type TransactionInput = z.input<typeof transactionSchema>;
export type TransactionOutput = z.output<typeof transactionSchema>;

/* ------------------------------------------------------------------ *
 * Cuotas por cobrar
 * ------------------------------------------------------------------ */

export const settleSplitSchema = z.object({
  splitId: z.uuid(),
  settledAccountId: z.uuid("Elige la cuenta a la que te llegó"),
  settledDate: isoDateSchema,
});

/* ------------------------------------------------------------------ *
 * Deudas propias
 * ------------------------------------------------------------------ */

export const debtSchema = z.object({
  id: z.uuid().optional(),
  description: z.string().trim().min(1, "¿De qué es la deuda?").max(140),
  creditorPersonId: z.uuid().optional().nullable(),
  creditorName: z.string().trim().min(1, "¿A quién le debes?").max(60),
  originalAmount: amountSchema,
  startDate: isoDateSchema,
  dueDate: isoDateSchema.optional().nullable().or(z.literal("")),
  origin: debtOriginSchema,
  /** Gasto ya registrado que el detector de duplicados vinculó. */
  originTransactionId: z.uuid().optional().nullable(),
  /** Solo para `cash_loan`: cuenta a la que entró el dinero prestado. */
  disbursementAccountId: z.uuid().optional().nullable(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const debtPaymentSchema = z.object({
  debtId: z.uuid(),
  amount: amountSchema,
  fromAccountId: z.uuid("Elige de qué cuenta sale el pago"),
  date: isoDateSchema,
  description: z.string().trim().max(140).optional().or(z.literal("")),
});

/* ------------------------------------------------------------------ *
 * Ahorro
 * ------------------------------------------------------------------ */

export const recordInterestSchema = z.object({
  accountId: z.uuid(),
  amount: amountSchema,
  date: isoDateSchema,
});

/* ------------------------------------------------------------------ *
 * Configuración
 * ------------------------------------------------------------------ */

export const settingsSchema = z.object({
  currency: z.string().trim().length(3, "Código de 3 letras, p. ej. USD, MXN, COP"),
  locale: z.string().trim().min(2).max(10),
});
