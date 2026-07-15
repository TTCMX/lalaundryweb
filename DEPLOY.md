# Desplegar en Vercel

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, corre el contenido de `supabase/schema.sql`. Esto crea:
   - `bookings` — cada recolección agendada.
   - `coverage_zips` — códigos postales con cobertura. **Vacía por defecto**: mientras esté vacía, `check-coverage` deja pasar cualquier CP (para no bloquear el flujo antes de cargar tu lista real). En cuanto insertes al menos un CP, la validación empieza a exigir coincidencia.
3. Cuando tengas tu lista de CPs, cárgala con algo como:
   ```sql
   insert into coverage_zips (cp) values ('06700'), ('03100'), ('11560');
   ```
4. Copia `Project URL` y el `service_role` key (Settings → API) — van en `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. **El service_role key nunca debe usarse en el frontend**; solo lo usan las funciones en `/api`.

## 2. MercadoPago

1. Crea una aplicación en [mercadopago.com.mx/developers](https://www.mercadopago.com.mx/developers/panel).
2. Usa el **access token de prueba** primero (modo sandbox) para probar todo el flujo con tarjetas de prueba antes de pasar a producción.
3. Ese token va en `MERCADOPAGO_ACCESS_TOKEN`.
4. No necesitas configurar el webhook manualmente en el panel — `create-preference.js` ya manda `notification_url` apuntando a `/api/mercadopago-webhook` en cada preferencia que crea.
5. El monto cobrado por "Pagar anticipo en línea" es fijo y lo controla `DEPOSIT_AMOUNT_MXN` (por defecto 300). Cámbialo cuando quieras sin tocar código.

## 3. Resend

1. Crea una cuenta en [resend.com](https://resend.com) y una API key.
2. Mientras no verifiques un dominio propio, usa `onboarding@resend.dev` como remitente (límite: solo puedes mandarte correos a ti mismo, útil para probar). Para enviar a tus clientes reales, verifica tu dominio en Resend y cambia `RESEND_FROM_EMAIL` a algo como `La Laundry <reservas@tudominio.com>`.
3. El correo de confirmación solo se envía si el cliente dejó su correo (el campo es opcional en el paso "Teléfono").

## 4. Variables de entorno en Vercel

En el proyecto de Vercel → Settings → Environment Variables, agrega todas las variables de `.env.example`:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | de tu proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | de tu proyecto Supabase |
| `MERCADOPAGO_ACCESS_TOKEN` | de tu app MercadoPago |
| `RESEND_API_KEY` | de tu cuenta Resend |
| `RESEND_FROM_EMAIL` | remitente verificado (o `onboarding@resend.dev` para pruebas) |
| `SITE_URL` | la URL pública de tu deploy, ej. `https://la-laundry.vercel.app` (sin `/` al final) |
| `DEPOSIT_AMOUNT_MXN` | `300` o el anticipo que definas |
| `OWNER_NOTIFICATION_EMAIL` | tu correo — recibe un aviso cada vez que se confirma una recolección |

`SITE_URL` debe actualizarse cada vez que cambie tu dominio (por ejemplo, al pasar de la URL de preview a tu dominio final), porque MercadoPago usa ese valor para saber a dónde regresar al cliente y a dónde mandar la notificación de pago.

## 5. Desplegar

```bash
npm i -g vercel   # si no lo tienes
vercel login
vercel link       # conecta esta carpeta a un proyecto de Vercel
vercel env pull .env.local   # opcional, para desarrollo local con `vercel dev`
vercel --prod
```

## 6. Probar en local

`vite dev` sirve el frontend pero no las funciones de `/api`. Para probar el flujo completo (incluyendo Supabase/MercadoPago/Resend) en tu máquina, usa:

```bash
vercel dev
```

Esto corre frontend + funciones serverless juntos, leyendo las variables de `.env.local` (o de `.env` si lo creas a partir de `.env.example`).

Nota: MercadoPago no puede llamar de vuelta a `http://localhost`, así que el webhook de pagos y el regreso del checkout solo funcionan probándolos contra un `SITE_URL` público (tu deploy de Vercel, o un túnel como ngrok apuntando a tu `vercel dev` local).
