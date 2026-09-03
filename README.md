# Finanzas

App web personal para llevar ingresos, egresos, cuentas, ahorro y deudas.
Pensada para usarse desde el teléfono y la computadora, y para costar **$0** al mes.

## Qué resuelve

- **Saldos reales por cuenta** — bancos, efectivo y ahorro, cada uno con su saldo, más el patrimonio neto.
- **Transferencias que no ensucian el análisis** — mover dinero entre tus cuentas no es ingreso ni egreso.
- **Gastos compartidos en un solo registro** — pagas 1 000, tres personas te dan 200 cada una, y el análisis cuenta **400**: solo lo que de verdad gastaste.
- **Ahorro con intereses opcionales** — proyección a 10 años y registro del interés que el banco realmente abona.
- **Deudas propias** — lo que debes se ve y se grafica, sin tocar ninguna cuenta hasta que pagas.
- **Análisis por semana, mes o año** — el mismo control cambia todas las gráficas de la página.

---

## Las tres reglas que hacen que los números cuadren

Están escritas una sola vez, en un solo archivo, para que sea imposible que una
pantalla las aplique y otra no.

| Regla | Dónde vive | Qué garantiza |
|---|---|---|
| **El saldo nunca se guarda, siempre se deriva** | [balances.ts](src/lib/queries/balances.ts) | Editar o borrar un movimiento no puede dejar un saldo obsoleto, porque no existe ningún saldo que actualizar. |
| **El gasto compartido cuenta neto desde el minuto uno** | [analytics.ts](src/lib/queries/analytics.ts) | La cuenta baja el bruto (lo que salió del banco), pero el análisis cuenta el neto. Cobrar una cuota mueve saldo y **no** reescribe un mes que ya pasó. |
| **Los pagos de deuda no se cuentan dos veces** | [debt-rules.ts](src/lib/debt-rules.ts) | `counts_as_expense` se *deriva* del origen de la deuda, no es una casilla que se te pueda olvidar. |

Un detalle de la tercera: al crear una deuda, si ya existe un egreso de monto
parecido en los últimos 60 días, la app lo detecta y te pregunta si es la compra
que la originó. Si dices que sí, se vincula sola y sus pagos dejan de contar como
gasto.

---

## Por qué no se "apaga" el backend

No hay servidor persistente que pueda dormirse:

- **Backend** = Server Actions de Next.js dentro de Vercel: funciones que no existen entre peticiones, así que no hay nada que apagar.
- **Base de datos** = Neon, que hace scale-to-zero pero despierta en menos de un segundo y **nunca pausa el proyecto** por inactividad (a diferencia del plan gratis de Supabase, que sí lo hace a los 7 días).

---

## Puesta en marcha

### 1. Base de datos en Neon

1. Crea un proyecto en [neon.tech](https://neon.tech) (plan gratis).
2. Copia la *connection string* **pooled**.

### 2. Credenciales de Google

En [Google Cloud Console](https://console.cloud.google.com) → *APIs y servicios* →
*Credenciales* → *Crear credenciales* → *ID de cliente de OAuth* → *Aplicación web*.

URIs de redirección autorizados:

```
    http://localhost:3000/api/auth/callback/google
https://TU-DOMINIO.vercel.app/api/auth/callback/google
```

### 3. Variables de entorno

```bash
cp .env.example .env.local
npx auth secret        # genera AUTH_SECRET
```

Llena `.env.local`:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Neon |
| `AUTH_SECRET` | Firma las sesiones |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | OAuth de Google |
| `ALLOWED_EMAILS` | **Crítico.** Solo estos correos pueden entrar |

> Sin `ALLOWED_EMAILS`, "iniciar sesión con Google" dejaría entrar a cualquiera
> con una cuenta de Google. Google demuestra *quién eres*, no que tengas permiso.
> Si la variable falta, la app cierra la puerta en vez de abrirla.

### 4. Crear las tablas y arrancar

```bash
npm install
npm run db:push     # aplica el esquema a Neon
npm run dev
```

### 5. Desplegar en Vercel

```bash
git push
```

Importa el repo en Vercel y copia las mismas variables de entorno en su panel.
Aplica el esquema (`npm run db:push`) antes del primer despliegue.

Desde el teléfono, el navegador ofrecerá *Añadir a pantalla de inicio*: se instala
como app y se abre sin barra de navegador.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm test` | Tests (Postgres real en memoria) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run db:push` | Aplica el esquema a la base |
| `npm run db:generate` | Genera una migración tras cambiar el esquema |
| `npm run db:studio` | Explorador visual de la base |

---

## Cómo está hecho

| Capa | Elección |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Estilos | Tailwind v4 + shadcn/ui, tokens OKLCH |
| Base de datos | Neon Postgres + Drizzle ORM |
| Auth | Auth.js v5 (Google) con lista blanca de correos |
| Gráficas | Recharts |
| Tests | Vitest + PGlite |

### Decisiones que conviene conocer antes de tocar el código

**El dinero son enteros en centavos.** Nunca floats: `0.1 + 0.2 !== 0.3` y ese
error se acumula hasta que los saldos dejan de cuadrar con el banco.
Ver [money.ts](src/lib/money.ts).

**Un solo tipo de movimiento para cinco casos.** `transactions` tiene
`from_account_id` y `to_account_id`; un ingreso solo tiene destino, un egreso solo
origen, una transferencia ambos. Un `CHECK` en la base impide filas mal formadas,
así que un bug no puede inventar un ingreso sin cuenta destino.

**Las subconsultas correlacionadas van con la tabla calificada a mano.** Drizzle
omite el nombre de la tabla cuando cree que no hace falta, y dentro de una
subconsulta ese `"id"` desnudo resuelve contra la tabla equivocada: la condición
no se cumple nunca y el saldo devuelve el inicial, **sin lanzar ningún error**.
Por eso `balances.ts` usa SQL explícito. Los tests cubren este caso.

**El driver HTTP de Neon no tiene transacciones interactivas.** Los ids se generan
en JS y las escrituras relacionadas van juntas en `db.batch()`, que sí es atómico.
Es lo que garantiza que un gasto y sus cuotas entren o fallen juntos.

**La paleta de gráficas está validada, no elegida a ojo.** Los ocho colores
categóricos pasan las comprobaciones de banda de luminosidad, croma, separación
bajo protanopía/deuteranopía y contraste, en modo claro y oscuro, contra las
superficies reales de la app. El orden es el mecanismo de seguridad para
daltonismo: nunca se cicla, y a partir del noveno elemento se agrupa en «Otras».
Ver [chart-theme.ts](src/lib/chart-theme.ts).

---

## Siguiente fase (no incluida)

Recomendaciones con IA. `analytics.ts` ya devuelve agregados limpios, así que
sería un endpoint que le pasa esos agregados —no filas crudas— a Claude y devuelve
observaciones accionables. La arquitectura está lista; el código no está escrito.
