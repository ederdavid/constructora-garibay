Project context:
• Sitio estático del estudio de arquitectura "Constructora Garibay".
• HTML/CSS/JS vanilla, SIN build step, SIN framework. El sitio vive en deploy/site/.
• Estética: minimalismo cálido (warm minimalist) — canvas hueso, tipografía serif
  Fraunces para títulos + Manrope para texto, un solo acento arcilla, bordes 1px,
  sin gradientes ni sombras pesadas. Contenido en español.
• Despliegue en NAS Synology vía GitHub Actions (runner self-hosted) + rsync,
  mismo patrón que el repo `cualotica`.
• nginx sirve deploy/site/; cloudflared expone el sitio por Cloudflare Tunnel
  (no se abren puertos en el router).
• Dominio: constructoragaribay.com (apex + www) → tunnel.

Infra clave:
• NAS: acidfenix@192.168.50.158, ruta /volume1/docker/constructora-garibay/
• docker en /usr/local/bin/docker, se invoca con sudo -S (password = secret NAS_SSH_PASSWORD).
• El tunnel se crea/configura una sola vez con: node scripts/cf-tunnel-setup.mjs
  (lee deploy/.env, imprime CLOUDFLARED_TOKEN).
• deploy/.env nunca se commitea; el workflow lo excluye del rsync para no pisarlo.

Al editar:
• El contenido (texto, proyectos, contacto, imágenes) son placeholders — están en
  deploy/site/index.html. Imágenes vía picsum.photos hasta tener fotos reales.
• Probar local: cd deploy/site && python3 -m http.server 8000
