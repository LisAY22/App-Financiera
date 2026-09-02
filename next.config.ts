import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin esto, Turbopack sube buscando un lockfile y encuentra el del directorio
  // personal, fuera del repositorio.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
