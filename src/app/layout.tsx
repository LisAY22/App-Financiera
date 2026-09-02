import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Finanzas",
    template: "%s · Finanzas",
  },
  description: "Tus ingresos, egresos, cuentas, ahorro y deudas en un solo lugar.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Finanzas",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6fc" },
    { media: "(prefers-color-scheme: dark)", color: "#141221" },
  ],
  width: "device-width",
  initialScale: 1,
  // La app se usa mucho en el teléfono con una mano; el zoom se queda
  // disponible a propósito, nunca se bloquea.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning className={`${inter.variable} h-full`}>
      <body className="min-h-full antialiased">
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
