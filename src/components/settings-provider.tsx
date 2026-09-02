"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatMoney, type Cents, type FormatMoneyOptions } from "@/lib/money";
import type { Settings } from "@/lib/queries/lookups";

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({
  settings,
  children,
}: {
  settings: Settings;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings debe usarse dentro de <SettingsProvider>");
  }
  return context;
}

/**
 * Formateador ya atado a la moneda y el idioma configurados, para que ningún
 * componente tenga que acordarse de pasarlos y una gráfica no acabe mostrando
 * una moneda distinta a la de la tarjeta de al lado.
 */
export function useMoneyFormatter() {
  const settings = useSettings();
  return useMemo(
    () =>
      (cents: Cents, options: Omit<FormatMoneyOptions, "currency" | "locale"> = {}) =>
        formatMoney(cents, { ...options, ...settings }),
    [settings],
  );
}
