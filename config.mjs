// Agents Office — configuration (Beta).
// office.config.json is the shipped default; office.config.local.json (gitignored) overrides it;
// environment variables override both: AO_NAME, AO_BRAIN, PORT, AO_MODEL.
// V3.1 keys: mcp { allow, deny, departments } · tools { web } · timeout (seconds per agent run) — see mcp.mjs.
// V3.2 (16 Sep) keys: tools { browser } (Claude in Chrome for the agents, default on) · teams { enabled, max } (Agent Teams, default on, up to 4 desks) — see teams.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(ROOT, file);
    if (fs.existsSync(p)) {
      try {
        const lines = fs.readFileSync(p, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            let val = trimmed.slice(eq + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!(key in process.env)) process.env[key] = val;
          }
        }
      } catch {}
    }
  }
}

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

export function loadConfig() {
  loadEnv();
  const base = readJSON(path.join(ROOT, 'office.config.json'));
  const local = readJSON(path.join(ROOT, 'office.config.local.json'));
  const c = { name: 'Agents Office', brain: './brain', port: 4520, model: 'sonnet', ...base, ...local }; // V3.6: model = sonnet · opus · fable
  c.mcp = { allow: [], deny: [], departments: {}, servers: [], ...(base.mcp || {}), ...(local.mcp || {}) };
  if (base.mcpServers || local.mcpServers) {
    c.mcpServers = { ...(base.mcpServers || {}), ...(local.mcpServers || {}) };
  }
  c.tools = { web: true, browser: true, ...(base.tools || {}), ...(local.tools || {}) }; // V3.2 (16 Sep): browser = Claude in Chrome
  c.teams = { enabled: true, max: 4, ...(base.teams || {}), ...(local.teams || {}) }; // V3.2 (16 Sep): Agent Teams
  c.openrouterApiKey = process.env.OPENROUTER_API_KEY || local.openrouterApiKey || local.openrouter_key || base.openrouterApiKey || '';
  c.openrouterModel = process.env.OPENROUTER_MODEL || local.openrouterModel || local.openrouter_model || base.openrouterModel || '';
  c.openrouterBaseUrl = process.env.OPENROUTER_BASE_URL || local.openrouterBaseUrl || base.openrouterBaseUrl || 'https://openrouter.ai/api/v1';
  c.models = {
    default: c.openrouterModel || c.model || 'anthropic/claude-3.5-sonnet',
    departments: {},
    fallbacks: [],
    ...(base.models || {}),
    ...(local.models || {})
  };
  if (process.env.AO_MODEL_EMAILS) c.models.departments.emails = process.env.AO_MODEL_EMAILS;
  if (process.env.AO_MODEL_MARKETING) c.models.departments.marketing = process.env.AO_MODEL_MARKETING;
  if (process.env.AO_MODEL_SALES) c.models.departments.sales = process.env.AO_MODEL_SALES;
  if (process.env.AO_MODEL_OPS) c.models.departments.ops = process.env.AO_MODEL_OPS;
  if (process.env.AO_MODEL_FIN) c.models.departments.fin = process.env.AO_MODEL_FIN;
  if (process.env.AO_MODEL_DELIVERY) c.models.departments.delivery = process.env.AO_MODEL_DELIVERY;
  if (process.env.AO_MODEL_FALLBACKS) {
    c.models.fallbacks = process.env.AO_MODEL_FALLBACKS.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (process.env.AO_NAME) c.name = process.env.AO_NAME;
  if (process.env.AO_BRAIN) c.brain = process.env.AO_BRAIN;
  if (process.env.PORT) c.port = +process.env.PORT;
  if (process.env.AO_MODEL) c.model = process.env.AO_MODEL;
  c.port = +c.port || 4520;
  c.brainPath = path.resolve(ROOT, c.brain);
  return c;
}
