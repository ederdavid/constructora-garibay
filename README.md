# Constructora Garibay

Sitio estático del estudio de arquitectura. HTML/CSS/JS puro (sin build),
servido por nginx detrás de un Cloudflare Tunnel, desplegado en un NAS Synology
vía GitHub Actions (runner self-hosted) — mismo patrón que `cualotica`.

```
constructora-garibay/
├── deploy/                     # todo lo que vive en el NAS
│   ├── site/                   # el sitio (esto es lo que editas)
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── main.js
│   │   └── favicon.svg
│   ├── nginx/nginx.conf        # sirve ./site
│   ├── docker-compose.yml      # nginx + cloudflared
│   ├── .env.example            # plantilla de secretos (copia a .env)
│   └── .env                    # secretos reales (NO en git)
├── scripts/
│   └── cf-tunnel-setup.mjs     # crea/configura el tunnel + DNS (una vez)
└── .github/workflows/deploy.yml
```

## Editar el sitio

Todo el contenido está en [deploy/site/](deploy/site/). Es vanilla, sin build:
abre [deploy/site/index.html](deploy/site/index.html) en el navegador y listo.

Para previsualizar con un servidor local (recomendado, así funcionan las rutas):

```bash
cd deploy/site && python3 -m http.server 8000   # → http://localhost:8000
```

Las imágenes son placeholders de `picsum.photos`. Para usar fotos reales: ponlas
en `deploy/site/assets/` y cambia los `src` en `index.html`. El texto, proyectos
y datos de contacto (correo/teléfono) también son placeholders — edítalos ahí.

## Puesta en marcha (una sola vez)

El dominio `constructoragaribay.com` ya está comprado en Cloudflare. Faltan:

### 1. Crear el tunnel + DNS

```bash
cp deploy/.env.example deploy/.env
# Rellena en deploy/.env: CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID
node scripts/cf-tunnel-setup.mjs
```

El script crea el tunnel `constructora-garibay`, apunta `constructoragaribay.com`
y `www` a él, configura el ingress hacia `nginx:80`, y al final imprime el
`CLOUDFLARED_TOKEN`. Guárdalo: va como secret en GitHub (paso 2), no en un archivo.

> Si en vez del script creaste el tunnel desde el dashboard de Cloudflare,
> asegúrate de configurar ahí un **Public Hostname**: `constructoragaribay.com`
> (y `www`) → Service `HTTP` → `nginx:80`. El cloudflared corriendo con `--token`
> usa la config de ingress que vive en Cloudflare, no un archivo local.

**Permisos del `CF_API_TOKEN`** (My Profile → API Tokens → Create Custom Token):
- Account · Cloudflare Tunnel · Edit
- Zone · DNS · Edit (sobre la zona `constructoragaribay.com`)

### 2. Secrets del repo en GitHub

Settings → Secrets and variables → Actions → New repository secret:

| Secret               | ¿Obligatorio? | Valor                                              |
| -------------------- | ------------- | -------------------------------------------------- |
| `NAS_SSH_PASSWORD`   | Sí            | contraseña SSH del usuario `acidfenix` en el NAS   |
| `CLOUDFLARED_TOKEN`  | Opcional      | token del tunnel (lo imprime `cf-tunnel-setup.mjs`) |

**El token del tunnel admite dos patrones** (el workflow detecta cuál usas):

- **A — secret de GitHub:** define `CLOUDFLARED_TOKEN` y el workflow regenera
  `deploy/.env` en el NAS en cada deploy. Cero archivos a mano.
- **B — `.env` en el NAS (patrón cualotica):** no definas el secret; coloca el
  `.env` una vez y el workflow lo respeta (rsync lo excluye):
  ```bash
  ssh acidfenix@192.168.50.158 "mkdir -p /volume1/docker/constructora-garibay"
  scp deploy/.env acidfenix@192.168.50.158:/volume1/docker/constructora-garibay/.env
  ```

Si no existe ni el secret ni el `.env` en el NAS, el deploy falla con un mensaje
claro indicando ambas opciones.

### 3. Runner self-hosted

El workflow corre en `runs-on: self-hosted`. En cuentas personales los runners
son por-repo, así que este repo tiene su propio runner en el mismo Mac:
`actions.runner.ederdavid-constructora-garibay.Mac-garibay`
(instalado en `~/actions-runner-garibay/`, convive con el de cualotica).

### 4. Primer deploy

```bash
git push origin main
```

…o desde la pestaña **Actions → Deploy to NAS → Run workflow**.

## Cómo funciona el deploy

`.github/workflows/deploy.yml` en cada push a `main`:

1. **rsync** `deploy/` → `acidfenix@192.168.50.158:/volume1/docker/constructora-garibay/`
   (con `--delete`, pero excluye `.env`).
2. **Asegura `deploy/.env`** en el NAS: lo regenera desde el secret
   `CLOUDFLARED_TOKEN` si existe, o usa el que ya esté en el NAS.
3. **`docker compose up -d --remove-orphans`** en el NAS — reinicia nginx con los
   archivos nuevos y mantiene `cloudflared` corriendo.
4. Verifica que `garibay-nginx` quede `running`.

No hay paso de build: nginx sirve `deploy/site/` tal cual.

## Servicios (docker-compose)

| Contenedor            | Qué hace                                            |
| --------------------- | --------------------------------------------------- |
| `garibay-nginx`       | sirve `./site` en el puerto 80 (red interna)        |
| `garibay-cloudflared` | tunnel a Cloudflare; expone el sitio sin abrir puertos |

Ningún puerto se publica al router: todo el tráfico entra por el tunnel.
```
internet → Cloudflare → tunnel → garibay-cloudflared → garibay-nginx → ./site
```

## Formulario de contacto (pendiente)

Hoy el formulario de [deploy/site/index.html](deploy/site/index.html) usa `mailto:`
como fallback: abre el cliente de correo del visitante. Funciona sin backend, pero
no captura los envíos del lado del servidor. Opciones para hacerlo "de verdad",
de menos a más esfuerzo:

1. **Cloudflare Worker + Email Routing** (recomendado — ya estás en Cloudflare).
   Un Worker recibe el `POST` del form, valida, y reenvía por correo (vía la API
   de Resend, MailChannels, o Email Routing). Cero infraestructura en el NAS, vive
   en el edge. El form haría `fetch('/api/contacto', { method: 'POST', ... })` y se
   rutea por el mismo tunnel/zona.
2. **Formspree / Basin** (sin código): cambiar el `action` del form a su endpoint.
   Rápido, pero es un tercero y tiene límites en el plan gratis.
3. **Microservicio en el NAS**: un contenedor Node pequeño (como `services/auth` de
   cualotica) detrás de nginx en `/api/contacto`, que guarde en SQLite o mande
   correo con Resend. Más control, más mantenimiento.

Cuando elijas, se agrega la ruta al `nginx.conf` (proxy a `/api/contacto`) o al
ingress del tunnel, y se cambia el `<form>` a `fetch`.
