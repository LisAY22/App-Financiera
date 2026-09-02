/**
 * Manifiesto PWA, para que la app se instale en el teléfono y se abra a
 * pantalla completa como cualquier otra, sin la barra del navegador.
 */
export function GET() {
  return Response.json({
    name: "Finanzas",
    short_name: "Finanzas",
    description: "Tus ingresos, egresos, cuentas, ahorro y deudas en un solo lugar.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f6fc",
    theme_color: "#6d3fd4",
    lang: "es",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}
