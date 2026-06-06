#!/usr/bin/env node
// cf-tunnel-setup.mjs — Crea y configura el Cloudflare Tunnel del sitio.
//
// Idempotente: corre las veces que quieras, no rompe nada.
//
// Hace cuatro cosas:
//   1. Crea (o reutiliza) un tunnel llamado "constructora-garibay",
//      gestionado remotamente (config_src: cloudflare).
//   2. Configura el ingress del tunnel:
//        constructoragaribay.com       → http://nginx:80
//        www.constructoragaribay.com    → http://nginx:80
//        catch-all                      → 404
//   3. Crea/actualiza los DNS records (CNAME) de apex y www apuntando al tunnel.
//   4. Imprime el CLOUDFLARED_TOKEN que va en deploy/.env.
//
// Requiere en deploy/.env:
//   CF_API_TOKEN   - permisos: Account·Cloudflare Tunnel·Edit  +  Zone·DNS·Edit
//   CF_ACCOUNT_ID  - dashboard → barra lateral derecha
//   CF_ZONE_ID     - dashboard del dominio → Overview → "Zone ID"
//   CF_DOMAIN      - opcional, default: constructoragaribay.com

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Cargar deploy/.env ─────────────────────────────────────────
function loadEnv() {
  const envPath = join(__dirname, "..", "deploy", ".env");
  if (!existsSync(envPath)) {
    console.error(`✗ No existe ${envPath}`);
    console.error(`  Copia deploy/.env.example a deploy/.env y rellena los valores.`);
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_ZONE_ID    = process.env.CF_ZONE_ID;
const CF_DOMAIN     = process.env.CF_DOMAIN || "constructoragaribay.com";
const TUNNEL_NAME   = process.env.CF_TUNNEL_NAME || "constructora-garibay";
const NGINX_SERVICE = process.env.NGINX_SERVICE || "nginx:80";

const required = { CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID };
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`✗ Faltan variables en deploy/.env: ${missing.join(", ")}`);
  console.error(`  Ver deploy/.env.example para instrucciones.`);
  process.exit(1);
}

// ─── Cliente HTTP ───────────────────────────────────────────────
async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const errs = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`CF ${method} ${path} → ${res.status} ${errs || res.statusText}`);
  }
  return json.result;
}

// ─── 1. Crear o reutilizar el tunnel ────────────────────────────
async function ensureTunnel() {
  console.log(`\n→ Buscando tunnel "${TUNNEL_NAME}"…`);
  const list = await cf(
    "GET",
    `/accounts/${CF_ACCOUNT_ID}/cfd_tunnel?name=${encodeURIComponent(TUNNEL_NAME)}&is_deleted=false`
  );
  let tunnel = (list || []).find((t) => t.name === TUNNEL_NAME);

  if (tunnel) {
    console.log(`  · ya existe (id ${tunnel.id.slice(0, 8)}…)`);
  } else {
    console.log(`  + creando tunnel nuevo…`);
    tunnel = await cf("POST", `/accounts/${CF_ACCOUNT_ID}/cfd_tunnel`, {
      name: TUNNEL_NAME,
      config_src: "cloudflare", // gestionado remotamente: el ingress se setea por API
    });
    console.log(`  + creado (id ${tunnel.id.slice(0, 8)}…)`);
  }

  const token = await cf("GET", `/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${tunnel.id}/token`);
  return { id: tunnel.id, token };
}

// ─── 2. Ingress del tunnel ──────────────────────────────────────
async function syncIngress(tunnelId) {
  console.log("\n→ Configurando ingress del tunnel…");
  const desired = [
    { hostname: CF_DOMAIN, service: `http://${NGINX_SERVICE}` },
    { hostname: `www.${CF_DOMAIN}`, service: `http://${NGINX_SERVICE}` },
    { service: "http_status:404" }, // catch-all (requerido por Cloudflare)
  ];

  const cfg = await cf(
    "GET",
    `/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/configurations`
  );
  const current = cfg?.config?.ingress || [];
  const same =
    current.length === desired.length &&
    current.every(
      (r, i) => r.hostname === desired[i].hostname && r.service === desired[i].service
    );

  if (same) {
    console.log(`  · ingress ya está al día (${desired.length} reglas)`);
    return;
  }

  await cf("PUT", `/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/configurations`, {
    config: { ingress: desired },
  });
  for (const r of desired) {
    console.log(`  + ${(r.hostname || "(catch-all)").padEnd(30)} → ${r.service}`);
  }
}

// ─── 3. DNS records ─────────────────────────────────────────────
async function syncDns(tunnelId) {
  console.log("\n→ Sincronizando DNS records…");
  const TUNNEL_HOST = `${tunnelId}.cfargotunnel.com`;
  const records = [
    { name: CF_DOMAIN, note: "apex" },
    { name: `www.${CF_DOMAIN}`, note: "www" },
  ];

  const existing = await cf("GET", `/zones/${CF_ZONE_ID}/dns_records?per_page=200`);
  const byName = new Map(existing.map((r) => [`${r.name}|${r.type}`, r]));

  for (const rec of records) {
    const desired = {
      type: "CNAME",
      name: rec.name,
      content: TUNNEL_HOST,
      proxied: true,
      ttl: 1,
      comment: "managed by cf-tunnel-setup.mjs",
    };
    const current = byName.get(`${rec.name}|CNAME`);

    if (!current) {
      await cf("POST", `/zones/${CF_ZONE_ID}/dns_records`, desired);
      console.log(`  + creado   ${rec.name.padEnd(32)} → ${TUNNEL_HOST}  [${rec.note}]`);
    } else if (current.content !== TUNNEL_HOST || current.proxied !== true) {
      await cf("PUT", `/zones/${CF_ZONE_ID}/dns_records/${current.id}`, desired);
      console.log(`  ~ actualizado ${rec.name.padEnd(32)} → ${TUNNEL_HOST}  [${rec.note}]`);
    } else {
      console.log(`  · ok       ${rec.name.padEnd(32)} → ${TUNNEL_HOST}  [${rec.note}]`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log(`╭───────────────────────────────────────────────╮`);
  console.log(`│  Constructora Garibay · Cloudflare Tunnel     │`);
  console.log(`├───────────────────────────────────────────────┤`);
  console.log(`│  dominio:  ${CF_DOMAIN.padEnd(35)}│`);
  console.log(`│  tunnel:   ${TUNNEL_NAME.padEnd(35)}│`);
  console.log(`│  origen:   http://${NGINX_SERVICE.padEnd(28)}│`);
  console.log(`╰───────────────────────────────────────────────╯`);

  const { id, token } = await ensureTunnel();
  await syncIngress(id);
  await syncDns(id);

  console.log(`\n✓ Listo. ${CF_DOMAIN} y www.${CF_DOMAIN} rutean al tunnel.`);
  console.log(`\n── Pega esto en deploy/.env ───────────────────────────────`);
  console.log(`CLOUDFLARED_TOKEN=${token}`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`\nLuego copia ese .env al NAS y levanta los contenedores:`);
  console.log(`  scp deploy/.env acidfenix@192.168.50.158:/volume1/docker/constructora-garibay/.env`);
  console.log(`  (o haz push a main: el workflow respeta el .env existente)`);
}

main().catch((e) => {
  console.error(`\n✗ Error: ${e.message}`);
  process.exit(1);
});
