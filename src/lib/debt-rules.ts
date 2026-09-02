import type { DebtOrigin } from "@/db/schema";

/**
 * La regla anti-doble-conteo, en un módulo sin dependencias del servidor.
 *
 * Vive aquí y no junto a las consultas porque el formulario (cliente) y las
 * acciones (servidor) tienen que aplicar EXACTAMENTE la misma regla. Duplicarla
 * en dos sitios sería la forma más fácil de que la UI prometa una cosa y la
 * base de datos guarde otra.
 */
export const DEBT_ORIGIN_OPTIONS: {
  value: DebtOrigin;
  label: string;
  help: string;
  countsAsExpense: boolean;
}[] = [
  {
    value: "purchase_untracked",
    label: "Compré algo y no lo registré como gasto",
    help: "Los pagos de esta deuda contarán como egreso el mes que los pagues. No registres además la compra original como gasto.",
    countsAsExpense: true,
  },
  {
    value: "purchase_tracked",
    label: "Ya registré la compra como gasto",
    help: "Los pagos solo moverán saldo, sin contar como egreso: el gasto ya quedó registrado en su fecha.",
    countsAsExpense: false,
  },
  {
    value: "cash_loan",
    label: "Me prestaron dinero que entró a mi cuenta",
    help: "Los pagos solo moverán saldo. El gasto se registrará cuando gastes ese dinero prestado.",
    countsAsExpense: false,
  },
];

/**
 * `counts_as_expense` se DERIVA del origen, nunca se marca a mano.
 *
 * Es la diferencia entre una regla y un aviso: no hay una casilla que se te
 * pueda olvidar, la respuesta a "¿cómo se originó?" ya determina la respuesta.
 */
export function countsAsExpenseFor(origin: DebtOrigin): boolean {
  return DEBT_ORIGIN_OPTIONS.find((o) => o.value === origin)?.countsAsExpense ?? true;
}

export function debtOriginHelp(origin: DebtOrigin): string {
  return DEBT_ORIGIN_OPTIONS.find((o) => o.value === origin)?.help ?? "";
}
