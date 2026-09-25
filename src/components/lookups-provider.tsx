"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Category, Person } from "@/db/schema";
import type { AccountWithBalance } from "@/lib/queries/balances";

export type Lookups = {
  accounts: AccountWithBalance[];
  categories: Category[];
  people: Person[];
};

const LookupsContext = createContext<Lookups | null>(null);

/**
 * Cuentas, categorías y personas que el layout ya cargó. Editar un movimiento
 * desde cualquier lista necesita las mismas opciones que el alta rápida, y
 * pasarlas por props a cada página que muestra movimientos sería repetirlas.
 */
export function LookupsProvider({
  value,
  children,
}: {
  value: Lookups;
  children: ReactNode;
}) {
  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}

export function useLookups(): Lookups {
  const context = useContext(LookupsContext);
  if (!context) {
    throw new Error("useLookups debe usarse dentro de <LookupsProvider>");
  }
  return context;
}
