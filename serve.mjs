// Agents Office — the local server (Beta).
// Serves the office and makes it real on your own Claude login:
//   · the command bar routes a typed task through Claude to the right agent in the department
//   · the agent produces the deliverable, which is saved as a note in your brain folder
//   · the Brain is your vault's real wiki-link graph, rebuilt live as notes are written
//   · chat with any agent is a real conversation in that agent's persona, grounded in your notes
// Everything stays on this machine: data/tasks.json and <brain>/Agents Office/*.md.
//
//   npm start                 → http://localhost:4520
//   PORT=4600 npm start       → another port
//
// Claude backend: the Claude Code CLI (`claude -p`, your existing login) — or the official SDK
// if ANTHROPIC_API_KEY is set. AO_MODEL=<model> overrides the model.
//
// V3.1: the connectors are real — the MCP servers your Claude Code is connected to are what the
// top bar shows and what the agents can call (mcp.mjs); the roster is yours (office.agents.json,
// roster.mjs). Tool calls only happen on the CLI backend: the SDK path has no MCP servers.
// V3.2: how the work is done is yours too — each agent's `brief` (roster.mjs) and the skills
// bound to it (skills.mjs: skills/ + <brain>/Agents Office/skills/) go into every task and chat.
// V3.3: the agents learn — every "revise: …" is recorded and standing rules come back into the
// prompt (learn.mjs); a department lead interviews the owner in chat and writes the briefs and a
// skill for its team (onboard.mjs). Roster, skills and lessons are re-read before every task.
// V3.5: routines — the office keeps its own clock (routines.mjs + src/when.js). A routine in
// <brain>/Agents Office/routines.json fires at its minute whether or not the page is open; the
// server creates the task, runs it here, and a result that needs the owner's OK waits in
// WAITING ON APPROVAL until /approve (the agent then does the outbound step) or /reject (with a
// note, which the agent learns from). Emails, Accounting and Sales only in this release.
// V3.2 (16 Sep): AGENT TEAMS + CLAUDE IN CHROME. A team task (TEAM in the bar, "as a team" in the sentence,
// `team: true` on a routine) goes to the department lead, who plans the pieces; the office runs one
// Claude process per teammate at the same time (teams.mjs, pool of `teams.max`), keeps the shared
// piece list and the notes they leave each other on the task (`task.team`, polled by the page), and
// the lead writes the finished deliverable from the pieces. Every `claude -p` gets --chrome when
// `tools.browser` is on: the agents can drive the owner's own Chrome (mcp.mjs).
// V3.2.1: the CALENDAR (P). A task can be scheduled for a date (`at` on POST /api/tasks → state
// 'scheduled', `dueAt`; the clock below fires it, marked LATE if the office was off) and a routine
// can start from a date (`when.start`, src/when.js). Cancel = DELETE /api/tasks/:id.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig, ROOT } from './config.mjs';
import { layoutGraph, readVault, readOfficeNotes } from './graph-build.mjs';
import { DEPTS, DEPT_KEYS } from './src/data.js';
import * as mcp from './mcp.mjs';
import { loadRoster } from './roster.mjs';
import { loadSkills } from './skills.mjs';
import * as learn from './learn.mjs';
import * as onboard from './onboard.mjs';
import * as routines from './routines.mjs';
import * as usage from './usage.mjs';
import * as teams from './teams.mjs';
import { normModel, modelFor, modelArgs, modelId, modelName, MODEL_KEYS, DEFAULT_MODEL, normEffort, effortFor, effortName, EFFORT_KEYS } from './src/models.js';
import { parseWhen, describe, valid as validWhen, untilText } from './src/when.js';
import { upsertTask, getTasks, deleteTask, saveNote, getNotes, getClients, addClient, getRoutines, upsertRoutine, deleteRoutine, getRealStats, testConnection, authSignUp, authSignIn, getProfile } from './supabase.mjs';

const cfg = loadConfig();
const HTML = path.join(ROOT, 'dist', 'command-centre-v2.html'); // built by build.mjs; shipped so npm start works without a build
const DATA = path.join(ROOT, 'data');
const FILE = path.join(DATA, 'tasks.json');
const BRAIN = cfg.brainPath;
const NOTES_DIR = path.join(BRAIN, 'Agents Office');
const CLI_CWD = path.join(os.tmpdir(), 'agents-office-cli'); // an empty cwd: no CLAUDE.md, no repo context
const version = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } })();
const RUN_TIMEOUT = Math.max(60, +cfg.timeout || 300) * 1000; // agents with tools take longer than a plain draft
{ const m = normModel(cfg.model); if (cfg.model && !m) console.warn(`config: model must be sonnet, opus or fable (got "${cfg.model}") — using ${DEFAULT_MODEL}`); cfg.model = m || DEFAULT_MODEL; } // V3.6: three models, by name
{ const e = normEffort(cfg.effort); if (cfg.effort && !e) console.warn(`config: effort must be low, medium, high, xhigh or max (got "${cfg.effort}") — using the model's own`); cfg.effort = e || ''; } // V3.6.1: the office's effort, empty = the model's own
mcp.configure(cfg);
const TEAMS = teams.settings(cfg); // V3.2 (16 Sep): { enabled, max }
const roster = loadRoster(BRAIN);
const AGENTS = roster.agents; // id · department · lead · name · role · does · tools · brief
for (const w of roster.problems) console.warn('agents:', w);
let skills = loadSkills(BRAIN, AGENTS); // reloaded before every task and chat, so a new skill needs no restart
for (const w of skills.problems) console.warn('skills:', w);
// the roster's editable fields are re-read too (a brief written by the lead's interview, or by hand, lands without a restart)
function reloadRoster() {
  const r = loadRoster(BRAIN);
  for (const a of r.agents) { const cur = AGENTS.find(x => x.id === a.id); if (cur) Object.assign(cur, { name: a.name, role: a.role, does: a.does, tools: a.tools, brief: a.brief }); }
  if (r.problems.join() !== roster.problems.join()) for (const w of r.problems) console.warn('agents:', w);
  Object.assign(roster, { problems: r.problems, customised: r.customised, briefed: r.briefed, files: r.files });
}
const refreshSkills = () => { reloadRoster(); const s = loadSkills(BRAIN, AGENTS); if (s.problems.join() !== skills.problems.join()) for (const w of s.problems) console.warn('skills:', w); skills = s; return s; };
const leadOf = dept => AGENTS.find(a => a.department === dept && a.lead) || AGENTS.find(a => a.department === dept);
const setupMap = () => Object.fromEntries(DEPT_KEYS.map(k => [k, onboard.isSetUp(AGENTS, skills, k)]));

let backend = 'claude-cli', sdk = null, openrouter = null;
if (cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY) {
  backend = 'openrouter';
  openrouter = {
    apiKey: cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY,
    baseURL: cfg.openrouterBaseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    defaultModel: cfg.openrouterModel || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'
  };
} else if (process.env.ANTHROPIC_API_KEY) {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    sdk = new Anthropic(); backend = 'anthropic-sdk';
  } catch (e) { console.warn('SDK not installed (npm install @anthropic-ai/sdk) — using the Claude CLI:', e.message.split('\n')[0]); }
}

/* ---------- storage ---------- */
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
const save = list => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
};

function isSupabaseEnabled() {
  try {
    const local = JSON.parse(fs.readFileSync(path.join(ROOT, 'office.config.local.json'), 'utf8'));
    return local.plugins?.supabase?.enabled === true && local.plugins?.supabase?.status === 'connected';
  } catch {
    return false;
  }
}

// Initial sync from Supabase database (only if enabled)
(async function syncFromSupabase() {
  if (!isSupabaseEnabled()) return;
  try {
    const dbTasks = await getTasks();
    if (dbTasks && dbTasks.length > 0) {
      save(dbTasks);
      console.log(`  supabase: synchronized ${dbTasks.length} real tasks from database`);
    }
  } catch (e) {
    console.warn('  supabase initial sync notice:', e.message);
  }
})();
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* ---------- the usage gauge (V3.6, A3): Claude's own numbers, the office's count underneath ---------- */
const USTATE = usage.loadState(DATA);
let usageCache = { at: 0, value: null, stale: true };
async function getUsage(force) {
  if (!force && !usageCache.stale && usageCache.value && Date.now() - usageCache.at < 60000) return usageCache.value;
  const u = await usage.fetchUsage();
  const v = u.ok ? { ...u, office: usage.fallback(USTATE).window } : { ...usage.fallback(USTATE), reason: u.reason };
  usageCache = { at: Date.now(), value: v, stale: false };
  return v;
}
function bumpUsage(u) { if (!u) return; Object.assign(USTATE, usage.record(USTATE, u)); usage.saveState(DATA, USTATE); usageCache.stale = true; }
const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/* ---------- ask Claude ---------- */
// askX → { text, tools }: tools = the MCP/web tools the agent actually called (for the office to
// light up). On the CLI the agent gets --allowedTools = every connected server the config allows
// (+ web); file tools, Bash and sub-agents stay off — the office is not a coding session.
// the model the agent's turn ran on: a --chrome run (V3.2 (16 Sep)) also reports a small Haiku helper call in modelUsage, so the first key is not the answer —
// prefer the key of the family we asked for, else the biggest non-Haiku talker
function ranOn(mu, want) {
  const keys = Object.keys(mu || {}); if (!keys.length) return null;
  const fam = normModel(want) || cfg.model;
  return keys.find(k => k.includes(fam)) || keys.filter(k => !/haiku/.test(k)).sort((a, b) => (mu[b].outputTokens || 0) - (mu[a].outputTokens || 0))[0] || keys[0];
}
const OPENROUTER_MODEL_MAP = {
  sonnet: 'anthropic/claude-3.5-sonnet',
  opus: 'anthropic/claude-3-opus',
  fable: 'anthropic/claude-3.5-haiku',
};

function candidateModelsFor({ model, dept, agent } = {}) {
  const list = [];
  const add = m => {
    if (!m) return;
    if (Array.isArray(m)) { for (const x of m) add(x); return; }
    const s = String(m).trim();
    if (s && !list.includes(s)) list.push(s);
  };

  // 1. Explicit model request from task / agent if custom (contains / or :)
  if (agent?.model && (agent.model.includes('/') || agent.model.includes(':'))) add(agent.model);
  if (model && (model.includes('/') || model.includes(':'))) add(model);

  // 2. Department-specific model
  if (dept && cfg.models?.departments?.[dept]) {
    add(cfg.models.departments[dept]);
  }

  // 3. Agent roster model mapped
  if (agent?.model && !agent.model.includes('/')) {
    add(OPENROUTER_MODEL_MAP[normModel(agent.model)]);
  }

  // 4. Task model mapped
  if (model && !model.includes('/')) {
    add(OPENROUTER_MODEL_MAP[normModel(model)]);
  }

  // 5. Office default
  add(cfg.models?.default || openrouter?.defaultModel || 'anthropic/claude-3.5-sonnet');

  // 6. Configured fallbacks
  if (cfg.models?.fallbacks?.length) add(cfg.models.fallbacks);

  // 7. General safety fallbacks
  add(['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat']);

  return list;
}

async function askX(system, user, { maxTokens = 4000, tools = true, timeout = RUN_TIMEOUT, model = cfg.model, effort = null, dept = null, agent = null } = {}) { // model: sonnet · opus · fable · effort: low…max or null = the model's own (src/models.js)
  if (backend === 'openrouter') {
    if (!openrouter?.apiKey) {
      throw new Error('OpenRouter API key is not configured. Please set your OpenRouter API key in Workspace Control Hub -> AI Models & Switching.');
    }
    const candidates = candidateModelsFor({ model, dept, agent });
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });

    let lastError = null;
    let switched = false;

    for (let i = 0; i < candidates.length; i++) {
      const targetModel = candidates[i];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch(`${openrouter.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouter.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/ajsahni/agents-office',
            'X-Title': 'Blackpeak Office'
          },
          body: JSON.stringify({
            model: targetModel,
            models: candidates.slice(i), // pass candidate list to OpenRouter for provider-level fallback
            max_tokens: maxTokens,
            messages
          }),
          signal: controller.signal
        });
        clearTimeout(timer);

        if (!res.ok) {
          const errText = await res.text();
          const isLimitOrUnavailable = res.status === 429 || res.status === 402 || res.status === 503 || res.status === 502 || res.status === 504 || res.status === 400;
          if (isLimitOrUnavailable && i < candidates.length - 1) {
            console.warn(`  ⚠ Model ${targetModel} limit/error (${res.status}: ${errText.slice(0, 100)}). Auto-switching to fallback: ${candidates[i + 1]}`);
            switched = true;
            lastError = new Error(`OpenRouter (${targetModel}): ${errText}`);
            continue; // try next candidate model
          }
          throw new Error(`OpenRouter API error ${res.status}: ${errText.slice(0, 300)}`);
        }

        const data = await res.json();
        const text = String(data.choices?.[0]?.message?.content || '').trim();
        const usageOut = data.usage ? {
          inputTokens: data.usage.prompt_tokens || 0,
          outputTokens: data.usage.completion_tokens || 0
        } : null;
        bumpUsage(usageOut);

        const modelUsed = data.model || targetModel;
        if (switched) {
          console.log(`  ✓ Resumed on fallback model: ${modelUsed}`);
        }

        const toolMatches = [];
        const usedMatch = text.match(/Used:\s*([^\n\r]+)/i);
        if (usedMatch) {
          const usedStr = usedMatch[1].toLowerCase();
          for (const s of mcp.usable()) {
            if (usedStr.includes(s.name.toLowerCase()) || (s.key && usedStr.includes(s.key.toLowerCase()))) {
              toolMatches.push(`mcp__${s.id}__action`);
            }
          }
        }
        return { text, tools: toolMatches, usage: usageOut, modelId: modelUsed };
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          if (i < candidates.length - 1) {
            console.warn(`  ⚠ Model ${targetModel} timed out. Auto-switching to fallback: ${candidates[i + 1]}`);
            switched = true;
            lastError = err;
            continue;
          }
          throw new Error(`OpenRouter request took longer than ${timeout / 1000} s`);
        }
        if (i < candidates.length - 1 && (err.message?.includes('429') || err.message?.includes('rate limit') || err.message?.includes('credits') || err.message?.includes('quota'))) {
          console.warn(`  ⚠ Model ${targetModel} limit reached. Auto-switching to fallback: ${candidates[i + 1]}`);
          switched = true;
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All model candidates failed');
  }
  if (sdk) {
    const res = await sdk.messages.create({ model: modelId(model), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
    if (res.stop_reason === 'refusal') throw new Error('Claude declined this request');
    bumpUsage(res.usage);
    return { text: res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(), tools: [], usage: res.usage, modelId: res.model };
  }
  fs.mkdirSync(CLI_CWD, { recursive: true });
  const allowed = tools ? mcp.allowedTools() : [];
  const args = ['-p', user, '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--system-prompt', system,
    '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,Agent,NotebookEdit,Task' + (allowed.includes('WebFetch') ? '' : ',WebFetch,WebSearch')];
  if (allowed.length) args.push('--allowedTools', allowed.join(','));
  args.push(...(tools ? mcp.cliArgs() : ['--no-chrome'])); // V3.2 (16 Sep): the owner's Chrome, when tools.browser is on
  args.push(...modelArgs(model, effort));
  const env = { ...process.env }; delete env.CLAUDECODE; // the CLI refuses to nest inside another Claude Code session
  return new Promise((resolve, reject) => {
    const p = spawn('claude', args, { cwd: CLI_CWD, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', text = '', used = [], gotResult = false, usageOut = null, modelUsed = null;
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`Claude took longer than ${timeout / 1000} s`)); }, timeout);
    const feed = line => {
      if (!line.trim()) return;
      let j; try { j = JSON.parse(line); } catch { return; }
      if (j.type === 'system' && j.subtype === 'init') mcp.fromInit(j);
      if (j.type === 'assistant' && j.message?.content) for (const b of j.message.content) if (b.type === 'tool_use' && b.name && !used.includes(b.name)) used.push(b.name);
      if (j.type === 'result') { gotResult = true; text = String(j.result || '').trim(); if (j.is_error && !text) text = ''; usageOut = j.usage || null; modelUsed = ranOn(j.modelUsage, model); }
    };
    p.stdout.on('data', d => { out += d; let i; while ((i = out.indexOf('\n')) >= 0) { feed(out.slice(0, i)); out = out.slice(i + 1); } });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? 'Claude Code is not installed (claude not found on PATH)' : e.message)); });
    p.on('close', code => {
      clearTimeout(timer); feed(out);
      if (code !== 0 && !gotResult) return reject(new Error(`claude exited ${code}${err ? ': ' + err.trim().slice(0, 300) : ''}`));
      if (!gotResult) { try { text = String(JSON.parse(out).result || '').trim(); } catch { text = out.trim(); } }
      bumpUsage(usageOut);
      resolve({ text, tools: used, usage: usageOut, modelId: modelUsed });
    });
  });
}
const ask = async (system, user, opts) => (await askX(system, user, { tools: false, ...opts })).text;
function parseJSON(text) {
  const s = text.replace(/```json|```/g, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return JSON.parse(s.slice(a, b + 1));
}

/* ---------- the brain: graph + context ---------- */
let graph = { notes: 0, nodes: [], links: [], floor: [] };
async function rebuildGraph() {
  try { graph = await layoutGraph(BRAIN); } catch (e) { console.warn('brain graph failed:', e.message); }
  return graph;
}
function vaultIndex() { // name → text (vault notes + live office notes)
  const { notes } = readVault(BRAIN); const m = new Map();
  for (const [name, n] of notes) m.set(name, n.text);
  for (const n of readOfficeNotes(BRAIN)) m.set(n.name, n.text);
  return m;
}
function businessContext(index) {
  const bits = [];
  for (const k of ['CLAUDE', 'index', 'business-model', 'voice']) if (index.has(k)) bits.push(`--- ${k}.md ---\n${index.get(k).slice(0, 1200)}`);
  return bits.join('\n\n');
}
// the notes an agent would read for this task: name/word overlap, department MOC first
function relevantNotes(index, dept, text, n = 4) {
  const words = new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
  const mocName = { emails: 'MOC-Emails', sales: 'MOC-Sales', marketing: 'MOC-Marketing', ops: 'MOC-Operations', fin: 'MOC-Finance', delivery: 'MOC-Delivery' }[dept];
  const scored = [];
  for (const [name, txt] of index) {
    if (['CLAUDE', 'index', 'log'].includes(name)) continue;
    const hay = (name + ' ' + txt.slice(0, 1500)).toLowerCase();
    let s = 0; for (const w of words) if (hay.includes(w)) s += name.toLowerCase().includes(w) ? 3 : 1;
    if (name === mocName) s += 2;
    if (s) scored.push([s, name]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const picks = scored.slice(0, n).map(x => x[1]);
  if (mocName && index.has(mocName) && !picks.includes(mocName)) picks.push(mocName);
  return picks;
}
function contextText(index, names) {
  return names.map(n => `--- ${n}.md ---\n${(index.get(n) || '').slice(0, 1800)}`).join('\n\n');
}

/* ---------- the roster, as Claude sees it ---------- */
const persona = a => `${a.name}${a.lead ? ' (lead)' : ''} · ${a.role} · ${a.does}`;
function rosterText(dept) { return AGENTS.filter(a => a.department === dept).map(a => { const sk = skills.names(a); return `- ${a.id} · ${persona(a)}${sk.length ? ' · skills: ' + sk.join(', ') : ''}`; }).join('\n'); }
// what an agent is told about itself: the job, the owner's standing instructions, the skills it follows
function agentBrief(a) {
  const lessons = learn.promptText(BRAIN, a);
  return (a.brief ? `\nSTANDING INSTRUCTIONS FROM THE OWNER\n${a.brief}\n` : '') + (skills.promptText(a) ? `\n${skills.promptText(a)}\n` : '') + (lessons ? `\n${lessons}\n` : '');
}
const toolKeys = names => [...new Set(names.map(n => /^mcp__/.test(n) ? mcp.keyOf(n) : n === 'WebSearch' || n === 'WebFetch' ? 'web' : null).filter(Boolean))];
async function route(dept, text) {
  const d = DEPTS[dept]; refreshSkills();
  const system = `You are the router for ${cfg.name}, a business whose departments are run by AI agents. ` +
    'Pick the single best agent for the owner\'s request — an agent whose skills match the request is the right one — and return ONLY a JSON object — no prose, no code fences.';
  const user = `Department: ${d.name}\nAgents (id · name · role · what they do):\n${rosterText(dept)}\n\nOwner's request: "${text}"\n\n` +
    'Return: {"agent":"<id from the list>","title":"<clean imperative task title, max 70 characters>","plan":["<step>","<step>","<step>"],"eta_minutes":<integer>,"why":"<one short sentence>","needs_ok":<true if doing this involves sending, posting, paying, deleting or changing anything outside this machine; false if it only reads and reports>}';
  const j = parseJSON(await ask(system, user, { maxTokens: 800, timeout: 150000, model: 'sonnet', dept })); // routing is a one-line JSON job: always Sonnet
  const valid = AGENTS.find(a => a.id === j.agent && a.department === dept);
  const agent = valid ? valid.id : (AGENTS.find(a => a.department === dept && a.lead) || AGENTS.find(a => a.department === dept)).id;
  return { agent, title: String(j.title || text).slice(0, 90), plan: Array.isArray(j.plan) ? j.plan.slice(0, 4).map(String) : [],
    eta: Number.isFinite(j.eta_minutes) ? j.eta_minutes : 30, why: String(j.why || ''), needsOk: typeof j.needs_ok === 'boolean' ? j.needs_ok : routines.guessNeedsOk(text) };
}
// the system prompt every agent run starts from: who it is, its brief, skills and lessons, its tools, the company, the notes for this task
function agentSystem(a, index, read, { extra = '', words = 260 } = {}) {
  const d = DEPTS[a.department];
  return `You are ${a.name}, ${a.role || 'an agent'}, in the ${d.name} department of ${cfg.name}. ${a.does}\n${agentBrief(a)}` + (extra ? `\n${extra}\n` : '') +
    'Write the finished deliverable itself, not a description of what you would do. Plain text: a short heading, then short sections or bullets. ' +
    `At most ${words} words unless a skill or the owner\'s instructions set a different shape — those win. No preamble, no sign-off. Ground it in the company notes below; where a fact is missing, make a reasonable assumption and mark it (assumed). ` +
    'If you used a tool, say so in one line at the end ("Used: Gmail — searched the client thread").\n\n' +
    `${mcp.promptText(a.tools)}\n\nCOMPANY NOTES\n${businessContext(index)}\n\nNOTES YOU READ FOR THIS TASK\n${contextText(index, read)}`;
}
const modeLineFor = (mode, task) => mode === 'draft' ? '\nPrepare everything, but send, post, pay or change NOTHING outside this machine: the owner reads this first and approves it. End with one line saying exactly what will go out when approved (or that nothing needs to).'
  : mode === 'approve' ? `\nThe owner has APPROVED the draft below. Carry out the outbound step now, exactly as drafted, with your tools (send, post, update). If a tool you need is not connected, say so and show what you would have sent. Then report in one short section: what went out, to whom, and anything that did not.\nApproved draft:\n${task.draft || task.result}` : '';
const pickFor = (task, a) => { // model + effort: four places, one precedence (task > routine > agent > office)
  const pick = modelFor({ task: task.model, routine: task.routineModel, agent: a.model, office: cfg.model });
  const eff = effortFor({ task: task.effort, routine: task.routineEffort, agent: a.effort, office: cfg.effort, model: pick.model });
  return { pick, eff };
};
// persist a task mid-run (a team's pieces move while the run is still going; the page polls /api/tasks)
function persist(task) { const l = load(); const i = l.findIndex(t => t.id === task.id); if (i >= 0) { l[i] = task; save(l); } upsertTask(task).catch(() => {}); }
async function run(task, feedback, mode) { // mode: undefined (a task from the bar) · 'routine' (read-only routine) · 'draft' (routine that waits for the OK) · 'approve' (the owner ticked it)
  if (task.team && TEAMS.enabled) { // V3.2 (16 Sep): a team task — the lead plans, the desks work at once, the lead writes the final
    if (mode === 'approve') return runTeamLead(task, feedback, mode); // the outbound step after the OK is the lead's alone
    if (feedback && task.team.pieces?.length) return runTeamLead(task, feedback, mode); // "revise: …" reworks the final from the same pieces
    return runTeam(task, mode);
  }
  const a = AGENTS.find(x => x.id === task.agent);
  refreshSkills();
  const index = vaultIndex();
  const read = relevantNotes(index, a.department, task.title + ' ' + task.text);
  const system = agentSystem(a, index, read);
  const routineLine = task.routine ? `\nThis is a routine (${task.when}): it runs on the office's own clock and the owner is not at the keyboard. It is now ${new Date().toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}${task.late ? `; this run is late, it was due ${new Date(task.due).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}. Do the work for now.`
    : task.dueAt ? `\nThis task was scheduled in advance for ${new Date(task.dueAt).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} and is running now; the owner is not at the keyboard${task.late ? ' and this run is late' : ''}. Do the work for now.` : '';
  const modeLine = modeLineFor(mode, task);
  const user = `Task: ${task.title}\nOwner's request: ${task.text}` + (task.plan?.length ? `\nAgreed plan: ${task.plan.join(' → ')}` : '') + routineLine + modeLine +
    (feedback && mode !== 'approve' ? `\n\nThe owner reviewed your previous version and asked for changes: "${feedback}"\nPrevious version:\n${task.result}` : '');
  const { pick, eff } = pickFor(task, a);
  const { text, tools, modelId: ran } = await askX(system, user, { model: pick.model, effort: eff.effort, dept: a.department, agent: a });
  if (!text) throw new Error('Claude returned nothing');
  return { result: text, read, tools: toolKeys(tools), used: mcp.namesOf(tools), skills: skills.names(a), modelUsed: pick.model, modelFrom: pick.from, modelId: ran, effortUsed: eff.effort || '', effortFrom: eff.from };
}

/* ---------- V3.2 (16 Sep) Agent Teams: the lead plans, the desks work at once, the lead writes the final ---------- */
const nameOf = id => id === 'lead' ? 'the lead' : (AGENTS.find(a => a.id === id)?.name || id);
const routineLineFor = task => task.routine ? `\nThis is a routine (${task.when}): it runs on the office's own clock and the owner is not at the keyboard. It is now ${new Date().toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Do the work for now.`
  : task.dueAt ? `\nThis task was scheduled in advance for ${new Date(task.dueAt).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} and is running now; the owner is not at the keyboard. Do the work for now.` : '';
async function runTeam(task, mode) {
  const lead = AGENTS.find(x => x.id === task.agent), dept = lead.department;
  refreshSkills();
  const index = vaultIndex();
  const seats = AGENTS.filter(a => a.department === dept).map(a => ({ id: a.id, lead: a.lead, name: a.name, role: a.role, does: a.does, skills: skills.names(a) }));
  const max = Math.min(TEAMS.max, teams.askedSize(task.text) || TEAMS.max);
  // 1. the plan — the lead splits the request across the desks (Sonnet, no tools: a JSON job)
  const pp = teams.planPrompt({ business: cfg.name, deptName: DEPTS[dept].name, lead, seats, text: task.text, title: task.title, max, notes: contextText(index, relevantNotes(index, dept, task.title + ' ' + task.text, 3)).slice(0, 4000) });
  let plan;
  try { plan = teams.parsePlan(await ask(pp.system, pp.user, { maxTokens: 1400, timeout: 150000, model: 'sonnet', dept }), { seats, lead, max, fallback: task }); }
  catch (e) { plan = { pieces: [{ agent: lead.id, title: task.title, text: task.text }], why: '', solo: true, error: e.message }; }
  task.team = { ...(task.team || {}), lead: lead.id, max, pieces: plan.pieces.map(p => ({ ...p, state: 'next' })), messages: [], why: plan.why, solo: plan.solo, plannedAt: Date.now() };
  persist(task);
  console.log(`  ⚑ ${task.id} team of ${plan.pieces.length}: ${plan.pieces.map(p => p.agent).join(' + ')}${plan.why ? ' — ' + plan.why : ''}`);
  // 2. the pieces — one Claude process per desk, at the same time (at most `max` in flight)
  const ids = task.team.pieces.map(p => p.agent);
  await teams.pool(task.team.pieces, max, async piece => {
    const a = AGENTS.find(x => x.id === piece.agent);
    piece.state = 'doing'; piece.startedAt = Date.now(); persist(task);
    try {
      const read = relevantNotes(index, dept, piece.title + ' ' + piece.text, 3);
      const system = agentSystem(a, index, read, { extra: teams.teamSection({ me: a, lead, pieces: task.team.pieces, nameOf }), words: 220 });
      const user = `Task (the whole request, for context): ${task.title}\nOwner's request: ${task.text}\n\nYOUR PIECE: ${piece.title}\n${piece.text}` + routineLineFor(task) + (mode === 'draft' ? modeLineFor('draft', task) : '');
      const { pick, eff } = pickFor(task, a);
      const { text, tools, modelId: ran } = await askX(system, user, { model: pick.model, effort: eff.effort, dept, agent: a });
      const { body, messages } = teams.parseMessages(text, ids);
      Object.assign(piece, { result: body || '(empty)', tools: toolKeys(tools), used: mcp.namesOf(tools), read, modelId: ran, error: !text });
      for (const m of messages) task.team.messages.push({ from: a.id, to: m.to === lead.id ? 'lead' : m.to, text: m.text, at: Date.now() });
    } catch (e) { Object.assign(piece, { result: 'Could not complete this piece: ' + e.message, error: true }); }
    piece.state = 'done'; piece.doneAt = Date.now(); persist(task);
    console.log(`    ${piece.error ? '✗' : '✓'} ${a.name}: ${piece.title} (${(piece.result || '').length} chars${piece.tools?.length ? ', tools: ' + piece.tools.join(' ') : ''})`);
  });
  // 3. the final — the lead writes the deliverable from the pieces and the notes
  return runTeamLead(task, null, mode);
}
async function runTeamLead(task, feedback, mode) {
  const lead = AGENTS.find(x => x.id === task.agent), tm = task.team;
  refreshSkills();
  const index = vaultIndex();
  const read = relevantNotes(index, lead.department, task.title + ' ' + task.text);
  const system = agentSystem(lead, index, read, { extra: `TEAM\nYou lead this team. The pieces below were done by your teammates (one of them may be yours). You write the finished deliverable from them.`, words: 450 });
  const user = teams.synthPrompt({ task, pieces: tm.pieces || [], messages: tm.messages || [], nameOf, feedback: mode === 'approve' ? null : feedback }) + routineLineFor(task) + modeLineFor(mode, task);
  const { pick, eff } = pickFor(task, lead);
  const { text, tools, modelId: ran } = await askX(system, user, { model: pick.model, effort: eff.effort, maxTokens: 6000, dept: lead.department, agent: lead });
  if (!text) throw new Error('Claude returned nothing');
  const allTools = [...new Set([...(tm.pieces || []).flatMap(p => p.tools || []), ...toolKeys(tools)])];
  const allUsed = [...new Set([...(tm.pieces || []).flatMap(p => p.used || []), ...mcp.namesOf(tools)])];
  const allRead = [...new Set([...read, ...(tm.pieces || []).flatMap(p => p.read || [])])];
  return { result: text, read: allRead, tools: allTools, used: allUsed, skills: skills.names(lead), modelUsed: pick.model, modelFrom: pick.from, modelId: ran, effortUsed: eff.effort || '', effortFrom: eff.from, team: tm };
}
function writeNote(task) { // the deliverable becomes a note in the brain, linked to what was read
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  const a = AGENTS.find(x => x.id === task.agent);
  const name = `${new Date(task.doneAt).toISOString().slice(0, 10)} ${slug(task.title)}`;
  const body = `---\nagent: ${a.name}\ndepartment: ${DEPTS[a.department].name}\ntask: ${task.id}\ndone: ${new Date(task.doneAt).toISOString()}${task.used?.length ? '\ntools: ' + task.used.join(', ') : ''}${task.skills?.length ? '\nskills: ' + task.skills.join(', ') : ''}${task.routine ? '\nroutine: ' + task.when + (task.late ? ' (late)' : '') : ''}${task.modelUsed ? '\nmodel: ' + modelName(task.modelUsed) + (task.modelFrom && task.modelFrom !== 'office' ? ' (' + task.modelFrom + ')' : '') : ''}${task.effortUsed ? '\neffort: ' + task.effortUsed + (task.effortFrom && task.effortFrom !== 'model' ? ' (' + task.effortFrom + ')' : '') : ''}${task.approved ? '\napproved: ' + new Date(task.approvedAt).toISOString() : ''}${task.team?.pieces?.length ? '\nteam: ' + task.team.pieces.map(p => nameOf(p.agent)).join(', ') : ''}\n---\n` +
    `# ${task.title}\n\n${task.result}\n\n---\nRead: ${(task.read || []).map(n => `[[${n}]]`).join(' · ') || '—'}\n` + teams.noteExtra(task.team, nameOf);
  fs.writeFileSync(path.join(NOTES_DIR, name + '.md'), body);
  const cat = task.dept === 'fin' ? 'invoice' : task.dept === 'delivery' ? 'report' : task.dept === 'sales' ? 'proposal' : task.dept === 'marketing' ? 'insight' : 'deliverable';
  saveNote({ title: task.title, category: cat, content: task.result || '', author_agent: a ? a.name : '', user_id: task.user_id || null }).catch(() => {});
  return name;
}
async function chat(agentId, text, history) {
  const a = AGENTS.find(x => x.id === agentId); if (!a) throw new Error('unknown agent');
  const d = DEPTS[a.department]; refreshSkills();
  const index = vaultIndex();
  const read = relevantNotes(index, a.department, text, 3);
  const mine = load().filter(t => t.agent === agentId).slice(-6).map(t => `- [${t.state}] ${t.title}`).join('\n');
  const system = `You are ${a.name}, ${a.role || 'an agent'}, in the ${d.name} department of ${cfg.name}. ${a.does}\n${agentBrief(a)}` +
    'You are talking to the owner. Answer as this agent, in first person, briefly (under 120 words unless asked for detail), plainly, no hype. ' +
    'Use the company notes; say when something is not in them. If the owner asks you to look something up, use your tools. Nothing outbound is sent without the owner\'s explicit say-so.\n\n' +
    `${mcp.promptText(a.tools)}\n\nCOMPANY NOTES\n${businessContext(index)}\n\nRELEVANT NOTES\n${contextText(index, read)}\n\nYOUR RECENT TASKS\n${mine || '—'}`;
  const convo = (history || []).slice(-8).map(m => `${m.who === 'user' ? 'Owner' : a.name}: ${m.text}`).join('\n');
  const { text: reply, tools } = await askX(system, (convo ? convo + '\n' : '') + `Owner: ${text}\n${a.name}:`, { maxTokens: 1200, model: modelFor({ agent: a.model, office: cfg.model }).model, effort: effortFor({ agent: a.effort, office: cfg.effort, model: modelFor({ agent: a.model, office: cfg.model }).model }).effort, dept: a.department, agent: a });
  return { reply, read, tools: toolKeys(tools), used: mcp.namesOf(tools) };
}

/* ---------- routines: the office's own clock (V3.5) ---------- */
const RSTATE = routines.loadState(DATA);
let rlist = { routines: [], problems: [], path: routines.file(BRAIN) };
function loadRoutines() { // re-read from disk every time: a routine written by Claude Code, or by hand, lands without a restart
  const r = routines.load(BRAIN, AGENTS);
  if (r.problems.join() !== rlist.problems.join()) for (const w of r.problems) console.warn('routines:', w);
  rlist = r;
  const { list, changed } = routines.withState(r.routines, RSTATE);
  if (changed) routines.saveState(DATA, RSTATE);
  return list;
}
const routinesOut = () => { const list = loadRoutines(); return { routines: list, depts: routines.ALLOWED, path: rlist.path, problems: rlist.problems }; };
const agentName = id => AGENTS.find(a => a.id === id)?.name || id;
// routine-driven runs go one at a time, so a burst of catch-ups after a long sleep does not spawn five Claude processes at once
let queue = Promise.resolve();
const enqueue = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };
function fire(r, { due = Date.now(), late = false, by = 'routine' } = {}) { // the routine becomes a task and runs here, page or no page
  const task = { id: nid(), dept: r.dept, agent: r.agent, title: r.title, text: r.text, plan: r.plan || [], eta: 15, why: '', state: 'next', addedAt: Date.now(), by, routine: r.id, when: r.desc || describe(r.when), needsOk: r.needsOk, due, late, routineModel: r.model || undefined, routineEffort: r.effort || undefined, team: r.team && TEAMS.enabled ? { lead: r.agent, asked: 'routine' } : undefined, user_id: r.user_id || undefined };
  const list = load(); list.push(task); save(list);
  upsertTask(task).catch(() => {});
  routines.advance(RSTATE, r, Date.now(), task.id, late); routines.saveState(DATA, RSTATE);
  console.log(`⏱ ${task.id} → ${task.agent}: ${task.title}${late ? ' (LATE · was due ' + new Date(due).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ')' : ''}`);
  enqueue(() => runServerTask(task.id));
  return task;
}
async function runServerTask(id, { feedback, approve } = {}) {
  let list = load(); const task = list.find(t => t.id === id); if (!task) return null;
  task.state = 'doing'; task.startedAt = Date.now(); delete task.ask; save(list);
  upsertTask(task).catch(() => {});
  try {
    const out = await run(task, feedback, approve ? 'approve' : task.needsOk ? 'draft' : 'routine');
    if (approve) { task.result = (task.draft || task.result) + '\n\n---\nAFTER YOUR OK\n' + out.result; task.approved = true; task.approvedAt = Date.now(); }
    else task.result = out.result;
    Object.assign(task, { read: out.read, tools: [...new Set([...(task.tools || []), ...out.tools])], used: [...new Set([...(task.used || []), ...out.used])], skills: out.skills, error: false, modelUsed: out.modelUsed, modelFrom: out.modelFrom, modelId: out.modelId, effortUsed: out.effortUsed, effortFrom: out.effortFrom, ...(out.team ? { team: out.team } : {}) });
    if (task.needsOk && !approve) { task.state = 'waiting'; task.draft = out.result; task.waitingAt = Date.now(); task.ask = routines.askLine(task); }
    else { task.state = 'done'; task.doneAt = Date.now(); task.note = writeNote(task); await rebuildGraph(); }
  } catch (e) {
    Object.assign(task, { state: 'done', doneAt: Date.now(), result: 'Could not complete this task: ' + e.message, error: true });
  }
  list = load(); const i = list.findIndex(t => t.id === task.id); if (i >= 0) list[i] = task; save(list);
  upsertTask(task).catch(() => {});
  console.log(`${task.error ? '✗' : task.state === 'waiting' ? '⏸' : '✓'} ${task.id} ${task.error ? 'failed' : task.state === 'waiting' ? 'waiting for your OK' : 'done'} (${task.result.length} chars${task.tools?.length ? ', tools: ' + task.tools.join(' ') : ''}${task.note ? ', note: ' + task.note : ''})`);
  return task;
}
function tickRoutines() {
  let list; try { list = loadRoutines(); } catch (e) { console.warn('routines:', e.message); return; }
  for (const { routine, due, late } of routines.due(list, RSTATE)) fire(routine, { due, late });
  tickScheduled();
}
function tickScheduled() { // V3.2.1: a task scheduled for a date fires on its minute — late (once) if the office was off
  const now = Date.now(); let list = load(); let changed = false;
  for (const t of list) {
    if (t.state !== 'scheduled' || !(t.dueAt <= now)) continue;
    t.state = 'next'; t.due = t.dueAt; t.late = now - t.dueAt > routines.LATE_AFTER; t.addedAt = now; changed = true;
    console.log(`⏱ ${t.id} scheduled task fires → ${t.agent}: ${t.title}${t.late ? ' (LATE · was due ' + new Date(t.dueAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + ')' : ''}`);
    enqueue(() => runServerTask(t.id));
  }
  if (changed) save(list);
}
const uniqueId = (base, list) => { let id = base || 'routine', n = 2; while (list.some(r => r.id === id)) id = `${base}-${n++}`; return id; };
function editRoutine(id, patch) { const r = rlist.routines.find(x => x.id === id); if (!r) return null; Object.assign(r, patch); routines.save(BRAIN, rlist.routines); return loadRoutines().find(x => x.id === id); }
function removeRoutine(id) { const n = rlist.routines.length; rlist.routines = rlist.routines.filter(x => x.id !== id); if (rlist.routines.length !== n) routines.save(BRAIN, rlist.routines); loadRoutines(); return rlist.routines.length !== n; }
// a sentence (or the REPEAT picker) → a routine in the brain file. Claude names the agent, the title and whether it needs the OK.
async function makeRoutine({ dept, text, when, agent, needsOk, model, effort }) {
  let taskText = String(text || '').trim(), w = when, parsed = null;
  if (!w) {
    parsed = parseWhen(taskText);
    if (!parsed) return { error: 'No schedule in that sentence. Say when: "every weekday at 8am, …", "Mondays 9am, …", "every hour 9-5, …".', noSchedule: true };
    if (parsed.needsDay) return { error: 'Which day? Say "every Monday …" or "Mon and Thu …".', needsDay: true };
    if (parsed.needsTime) return { error: 'What time? Say "… at 8am" or "… at 17:30".', needsTime: true };
    w = parsed.when; taskText = parsed.text;
  }
  if (!validWhen(w)) return { error: 'That schedule is not complete.' };
  if (!taskText) return { error: 'What should happen? The sentence has a time but no task.' };
  loadRoutines();
  const r = await route(dept, taskText);
  const a = agent && AGENTS.find(x => x.id === agent && x.department === dept) ? agent : r.agent;
  const v = routines.validate({ id: uniqueId(slug(r.title).slice(0, 40), rlist.routines), dept, agent: a, title: r.title, text: taskText, when: w, needsOk: typeof needsOk === 'boolean' ? needsOk : r.needsOk, plan: r.plan, model: normModel(model) || undefined, effort: normEffort(effort) || undefined }, AGENTS, rlist.routines);
  if (v.problems.length) return { error: v.problems.join('; ') };
  rlist.routines.push(v.routine); routines.save(BRAIN, rlist.routines);
  const out = loadRoutines().find(x => x.id === v.routine.id);
  console.log(`⏱ routine ${out.id} → ${out.agent}: ${out.title} (${out.desc} · next ${untilText(out.nextAt)}${out.needsOk ? ' · waits for the OK' : ''})`);
  return { ok: true, routine: out, why: r.why, guessed: parsed?.guessed ? parsed.guessWord : null };
}
// B2: a routine said to an agent in chat. The lead routes it inside the department; a specialist takes it on.
async function routinesChat(a, text) {
  const t = String(text).trim(), dept = a.department, allowed = routines.ALLOWED.includes(dept);
  if (/^\s*(routines?|schedule|timetable|what(?:'s| is) (?:scheduled|on the (?:schedule|timetable)))\s*\??\s*$/i.test(t)) return { reply: allowed ? routines.listText(loadRoutines(), dept, AGENTS) : routines.refusal(dept) };
  const cmd = /^\s*(pause|stop|resume|start|unpause|delete|remove|run)\b\s*(?:the\s+)?(.*?)\s*[.!]?$/i.exec(t);
  if (cmd && allowed && !parseWhen(t)) {
    const list = loadRoutines(); const words = cmd[2].replace(/\s+(routine|one)$/i, ''); const r = routines.matchRoutine(list, dept, words);
    if (!r) return { reply: (list.some(x => x.dept === dept) ? 'Which one? ' : '') + routines.listText(list, dept, AGENTS) };
    const verb = cmd[1].toLowerCase();
    if (verb === 'run') { const task = fire(r, { by: 'you' }); return { reply: `Running "${r.title}" now — ${r.agent === a.id ? 'I have it' : agentName(r.agent) + ' has it'}. It lands in the panel${r.needsOk ? ' and waits for your OK before anything is sent' : ''}.`, task }; }
    if (/pause|stop/.test(verb)) { editRoutine(r.id, { paused: true }); return { reply: `Paused "${r.title}". It stays on the timetable; say "resume ${r.title.toLowerCase()}" to start it again.` }; }
    if (/resume|start|unpause/.test(verb)) { const n = editRoutine(r.id, { paused: false }); return { reply: `"${r.title}" is back on — next ${untilText(n.nextAt)}.` }; }
    if (/delete|remove/.test(verb)) { removeRoutine(r.id); return { reply: `Deleted "${r.title}". It is off the timetable.` }; }
  }
  const p = parseWhen(t);
  if (!p) return null;
  if (!allowed) return { reply: routines.refusal(dept) };
  if (p.needsDay) return { reply: 'Which day? Say it again with the day: "every Monday at 9am, …".' };
  if (p.needsTime) return { reply: `What time? Say it again with the time, e.g. "every weekday at 8am, ${p.text ? p.text.slice(0, 60) : '…'}".` };
  if (!p.text) return { reply: 'I have the time but not the task. Say it again with what should happen.' };
  const made = await makeRoutine({ dept, text: p.text, when: p.when, agent: a.lead ? undefined : a.id });
  if (made.error) return { reply: made.error };
  const r = made.routine, who = r.agent === a.id ? 'I have it' : `${agentName(r.agent)} has it`;
  return { reply: `Done. ${r.desc.charAt(0).toUpperCase() + r.desc.slice(1)}, ${who}.${made.guessed ? ` I took "${made.guessed}" as ${r.when.at}; say a time to change it.` : ''} ${r.needsOk ? 'Anything to send waits for your OK first.' : 'It only reads, so it will not wait for you.'} Next run ${untilText(r.nextAt)}. Say "routines" to see the list, "pause ${r.title.toLowerCase()}" to stop it.`, routine: r };
}

/* ---------- http ---------- */
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = req => new Promise((resolve, reject) => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } }); });

await rebuildGraph();
const discovering = mcp.discover().then(l => { console.log(`  connectors: ${l.filter(s => s.status === 'connected').length} connected of ${l.length} (claude mcp list)`); return l; });
const agentsOut = () => { const setup = setupMap(); return AGENTS.map(a => ({ id: a.id, name: a.name, role: a.role, does: a.does, tools: a.tools, brief: a.brief || '', model: a.model || '', effort: a.effort || '', skills: skills.names(a), lessons: learn.count(BRAIN, a.id), department: a.department, lead: a.lead,
  interviewer: leadOf(a.department).id === a.id, setUp: setup[a.department] })); };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/command-centre-v2.html' || url.pathname === '/dark')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      const page = fs.readFileSync(HTML, 'utf8');
      return res.end(url.pathname === '/dark' ? page.replace('<body>', '<body class="dark">') : page); // /dark: the same file, opened in dark mode
    }
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, version, backend, model: cfg.model, modelName: modelName(cfg.model), models: MODEL_KEYS, effort: cfg.effort || '', efforts: EFFORT_KEYS, name: cfg.name, brain: BRAIN, notes: graph.notes, depts: DEPT_KEYS,
      agents: agentsOut(), setup: setupMap(), routines: (l => ({ count: l.length, paused: l.filter(r => r.paused).length, depts: routines.ALLOWED }))(loadRoutines()), roster: { customised: roster.customised, briefed: roster.briefed, files: roster.files, problems: roster.problems }, skills: (({ count, shipped, brain, problems }) => ({ count, shipped, brain, problems }))(skills.summary()), tools: backend === 'claude-cli' || backend === 'openrouter', mcp: mcp.summary(), teams: TEAMS, browser: mcp.summary().browser });
    if (url.pathname === '/api/agents') return json(res, 200, { agents: agentsOut(), problems: roster.problems, files: roster.files });
    if (url.pathname === '/api/skills') return json(res, 200, refreshSkills().summary()); // reloads from disk: edit a skill, hit this, see it
    if (url.pathname === '/api/lessons') return json(res, 200, { dir: learn.dir(BRAIN), agents: AGENTS.map(a => ({ id: a.id, name: a.name, ...learn.read(BRAIN, a.id) })).filter(x => x.rules.length || x.oneOffs.length) });
    if (url.pathname === '/api/mcp') { if (url.searchParams.get('refresh') === '1') await mcp.discover(); else await discovering; return json(res, 200, { ...mcp.summary(), tools: backend === 'claude-cli' || backend === 'openrouter' }); }
    if (url.pathname === '/api/brain') return json(res, 200, graph);
    if (url.pathname === '/api/usage') return json(res, 200, await getUsage(url.searchParams.get('refresh') === '1')); // V3.6: the plan's gauge (never a 500: unavailable is an answer)
    if (url.pathname === '/api/tasks' && req.method === 'GET') {
      if (isSupabaseEnabled()) {
        const uid = url.searchParams.get('user_id');
        const dbTasks = await getTasks(uid || null);
        if (Array.isArray(dbTasks) && dbTasks.length > 0) {
          save(dbTasks);
          return json(res, 200, dbTasks);
        }
      }
      return json(res, 200, load());
    }
    if (url.pathname === '/api/stats' && req.method === 'GET') {
      const uid = url.searchParams.get('user_id') || null;
      try {
        const { getRealStats } = await import('./supabase.mjs?t=' + Date.now());
        const s = await getRealStats(uid);
        return json(res, 200, s || {});
      } catch {
        return json(res, 200, {});
      }
    }
    if (url.pathname === '/api/notes' && req.method === 'GET') {
      const uid = url.searchParams.get('user_id') || null;
      return json(res, 200, await getNotes(uid));
    }
    if (url.pathname === '/api/clients' && req.method === 'GET') {
      const uid = url.searchParams.get('user_id') || null;
      return json(res, 200, await getClients(uid));
    }
    if (url.pathname === '/api/clients' && req.method === 'POST') {
      const b = await body(req);
      const ok = await addClient(b);
      return json(res, ok ? 200 : 400, { ok });
    }
    if (url.pathname === '/api/routines' && req.method === 'GET') return json(res, 200, routinesOut());
    if (url.pathname === '/api/routines' && req.method === 'POST') {
      const b = await body(req);
      if (!DEPTS[b.dept] || b.dept === 'brain') return json(res, 400, { error: 'unknown department' });
      if (!routines.ALLOWED.includes(b.dept)) return json(res, 400, { error: routines.refusal(b.dept), refused: true });
      const r = await makeRoutine({ dept: b.dept, text: b.text, when: b.when, agent: b.agent, needsOk: b.needsOk, model: b.model, effort: b.effort });
      if (r && r.routine) upsertRoutine(r.routine, b.user_id || null).catch(() => {});
      return json(res, r.error ? 400 : 200, r);
    }
    const rm = url.pathname.match(/^\/api\/routines\/([^/]+)(?:\/(run|pause|resume))?$/);
    if (rm) {
      const r = loadRoutines().find(x => x.id === rm[1]);
      if (!r) return json(res, 404, { error: 'no such routine' });
      if (req.method === 'DELETE') { removeRoutine(r.id); deleteRoutine(r.id).catch(() => {}); return json(res, 200, { ok: true, routines: loadRoutines() }); }
      if (req.method !== 'POST') return json(res, 405, { error: 'POST or DELETE' });
      if (rm[2] === 'run') return json(res, 200, { ok: true, task: fire(r, { by: 'you' }), routines: loadRoutines() });
      if (rm[2] === 'pause' || rm[2] === 'resume') { editRoutine(r.id, { paused: rm[2] === 'pause' }); upsertRoutine({ ...r, paused: rm[2] === 'pause' }).catch(() => {}); return json(res, 200, { ok: true, routines: loadRoutines() }); }
      const b = await body(req); const patch = {};
      if (typeof b.needsOk === 'boolean') patch.needsOk = b.needsOk; if (typeof b.paused === 'boolean') patch.paused = b.paused;
      if (typeof b.text === 'string' && b.text.trim()) patch.text = b.text.trim(); if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim().slice(0, 90);
      if (b.when && validWhen(b.when)) patch.when = b.when;
      if (b.model !== undefined) patch.model = normModel(b.model) || '';
      if (b.effort !== undefined) patch.effort = normEffort(b.effort) || '';
      const updatedR = editRoutine(r.id, patch);
      if (updatedR) upsertRoutine(updatedR, b.user_id || null).catch(() => {});
      return json(res, 200, { ok: true, routines: loadRoutines() });
    }
    if (url.pathname === '/api/tasks' && req.method === 'POST') {
      const { dept, text, model, effort, team, at, user_id } = await body(req);
      if (!DEPTS[dept] || dept === 'brain') return json(res, 400, { error: 'unknown department' });
      if (!text || !String(text).trim()) return json(res, 400, { error: 'empty task' });
      const dueAt = at ? (typeof at === 'number' ? at : Date.parse(at)) : null; // V3.2.1: a task for a date
      if (at && !(dueAt > 0)) return json(res, 400, { error: 'at must be a time (ms or ISO)' });
      if (dueAt && dueAt < Date.now() - 60000) return json(res, 400, { error: 'that time has passed — pick one that is still ahead' });

      if (dept === 'ceo') {
        // Executive Command Delegation: CEO analyzes the mandate and dispatches to departments
        const low = String(text).toLowerCase();
        let targetDepts = [];
        if (/market|post|reel|ad|campaign|social|content/i.test(low)) targetDepts.push('marketing');
        if (/operat|ops|complian|legal|sop|report|board|system/i.test(low)) targetDepts.push('ops');
        if (/email|inbox|reply|mail/i.test(low)) targetDepts.push('emails');
        if (/sale|lead|prospect|deal|pipeline/i.test(low)) targetDepts.push('sales');
        if (/financ|invoic|bill|pay|reconcil/i.test(low)) targetDepts.push('fin');
        if (/deliver|qa|asset|client report/i.test(low)) targetDepts.push('delivery');
        if (!targetDepts.length) targetDepts = ['ops', 'marketing']; // Default cross-department delegation

        const ceoTask = {
          id: nid(),
          dept: 'ceo',
          agent: 'ceo_lead',
          title: String(text).trim().slice(0, 90),
          text: String(text).trim(),
          plan: ['Triage executive directive', 'Dispatch sub-operations to department leads', 'Track execution across pods', 'Compile master company report'],
          why: `Executive Command: dispatched sub-operations to ${targetDepts.map(d => DEPTS[d]?.name || d).join(' & ')}`,
          state: 'next',
          addedAt: Date.now(),
          by: 'you',
          user_id: user_id || undefined,
          model: normModel(model) || undefined,
          effort: normEffort(effort) || undefined,
          delegated: []
        };

        const list = load();
        list.push(ceoTask);

        // Create delegated child tasks in target departments
        for (const td of targetDepts) {
          const leadAgent = leadOf(td);
          const childTitle = `${ceoTask.title} (${DEPTS[td]?.short || td} Directive)`;
          const childTask = {
            id: nid(),
            dept: td,
            agent: leadAgent.id,
            title: childTitle,
            text: `[Delegated from Head Table]: ${ceoTask.text}`,
            plan: [`Execute ${DEPTS[td]?.name} piece`, 'Conduct QA & review', 'Submit deliverable to Head Table'],
            why: `Delegated by Chief Executive from Head Table`,
            state: 'next',
            addedAt: Date.now(),
            by: 'ceo',
            parent: ceoTask.id,
            user_id: user_id || undefined
          };
          list.push(childTask);
          ceoTask.delegated.push({ id: childTask.id, dept: td, agent: leadAgent.id, title: childTitle, text: childTask.text });
          upsertTask(childTask, user_id).catch(() => {});
          console.log(`+ Delegated ${childTask.id} → ${childTask.agent} (${td}): ${childTitle}`);
        }

        save(list);
        upsertTask(ceoTask, user_id).catch(() => {});

        // Save initial executive briefing note in Supabase
        saveNote({
          title: `Executive Briefing: ${ceoTask.title}`,
          content: `# Executive Mandate Briefing\n\n**Directive:** ${ceoTask.text}\n**Orchestration Lead:** Chief Executive & Head Table\n**Target Departments:** ${targetDepts.map(d => DEPTS[d]?.name || d).join(', ')}\n\n## Sub-Operations Dispatched\n${ceoTask.delegated.map(d => `- **${DEPTS[d.dept]?.name || d.dept}**: ${d.title}`).join('\n')}\n\n*Status: Active cross-departmental execution monitored in real time.*`,
          category: 'executive',
          department: 'ceo',
          user_id: user_id || undefined
        }).catch(() => {});

        console.log(`+ CEO DIRECTIVE ${ceoTask.id}: Dispatched to ${targetDepts.join(', ')}`);
        return json(res, 200, ceoTask);
      }

      const r = await route(dept, String(text).trim());
      const asTeam = TEAMS.enabled && (team === true || teams.intent(text)); // V3.2 (16 Sep): TEAM in the bar, or "as a team" in the sentence → the lead owns it and splits it
      const task = { id: nid(), dept, agent: asTeam ? leadOf(dept).id : r.agent, title: r.title, text: String(text).trim(), plan: r.plan, eta: r.eta, why: asTeam ? `team — ${leadOf(dept).name} splits it across the desks` : r.why, state: 'next', addedAt: Date.now(), by: 'you', user_id: user_id || undefined, model: normModel(model) || undefined, effort: normEffort(effort) || undefined, // model/effort: set on this task (beats routine, agent, office)
        team: asTeam ? { lead: leadOf(dept).id, asked: team === true ? 'you' : 'text' } : undefined };
      if (dueAt) { task.state = 'scheduled'; task.dueAt = dueAt; task.needsOk = r.needsOk; } // waits for its minute; needsOk decides whether it then waits for the OK
      const list = load(); list.push(task); save(list);
      upsertTask(task, user_id).catch(() => {});
      console.log(`+ ${task.id} → ${task.agent}: ${task.title}${asTeam ? ' (team)' : ''}${dueAt ? ' · scheduled ' + untilText(dueAt) : ''}`);
      return json(res, 200, task);
    }
    if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
      const b = await body(req);
      const resAuth = await authSignUp(b);
      return json(res, resAuth.error ? 400 : 200, resAuth);
    }
    if (url.pathname === '/api/auth/signin' && req.method === 'POST') {
      const b = await body(req);
      const resAuth = await authSignIn(b);
      return json(res, resAuth.error ? 400 : 200, resAuth);
    }
    if (url.pathname === '/api/auth/profile' && req.method === 'GET') {
      const uid = url.searchParams.get('id');
      if (!uid) return json(res, 400, { error: 'user id required' });
      const prof = await getProfile(uid);
      return json(res, 200, prof || { id: uid });
    }
    if (url.pathname === '/api/config/settings' && req.method === 'GET') {
      const localPath = path.join(ROOT, 'office.config.local.json');
      let localData = {};
      try { localData = JSON.parse(fs.readFileSync(localPath, 'utf8')); } catch {}
      const activeKey = localData.openrouterApiKey !== undefined ? localData.openrouterApiKey : (cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY || '');
      const activeModel = localData.openrouterModel || cfg.openrouterModel || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
      return json(res, 200, {
        ok: true,
        backend,
        openrouterApiKey: activeKey,
        openrouterModel: activeModel,
        models: {
          default: localData.models?.default || cfg.models?.default || activeModel,
          departments: {
            ceo: ['anthropic/claude-3.7-sonnet', 'openai/gpt-4o'],
            emails: ['anthropic/claude-3.5-haiku', 'google/gemini-2.5-flash'],
            marketing: ['anthropic/claude-3.7-sonnet', 'openai/gpt-4o'],
            sales: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
            ops: ['deepseek/deepseek-chat', 'openai/gpt-4o'],
            fin: ['anthropic/claude-3.7-sonnet', 'openai/gpt-4o'],
            delivery: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
            ...(cfg.models?.departments || {}),
            ...(localData.models?.departments || {})
          },
          fallbacks: localData.models?.fallbacks || cfg.models?.fallbacks || [
            'anthropic/claude-3.5-sonnet',
            'openai/gpt-4o',
            'google/gemini-2.5-pro',
            'deepseek/deepseek-chat'
          ]
        },
        plugins: localData.plugins || {
          gmail: { enabled: false, status: 'disconnected', account: '' },
          google_calendar: { enabled: false, status: 'disconnected', account: '' },
          meta: { enabled: false, status: 'disconnected', account: '' },
          twitter: { enabled: false, status: 'disconnected', account: '' },
          slack: { enabled: false, status: 'disconnected', account: '' },
          supabase: { enabled: false, status: 'disconnected', account: '' },
          browser: { enabled: false, status: 'disconnected', account: '' },
          web: { enabled: false, status: 'disconnected', account: '' }
        }
      });
    }
    if (url.pathname === '/api/config/settings' && req.method === 'POST') {
      const b = await body(req);
      const localPath = path.join(ROOT, 'office.config.local.json');
      let localData = {};
      try { localData = JSON.parse(fs.readFileSync(localPath, 'utf8')); } catch {}

      if (b.openrouterApiKey !== undefined) {
        const cleanedKey = String(b.openrouterApiKey).trim();
        localData.openrouterApiKey = cleanedKey;
        cfg.openrouterApiKey = cleanedKey;
        process.env.OPENROUTER_API_KEY = cleanedKey;
        if (cleanedKey) {
          backend = 'openrouter';
          if (!openrouter) {
            openrouter = {
              apiKey: cleanedKey,
              baseURL: cfg.openrouterBaseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
              defaultModel: cfg.openrouterModel || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'
            };
          } else {
            openrouter.apiKey = cleanedKey;
          }
        } else {
          if (openrouter) openrouter.apiKey = '';
          if (!process.env.ANTHROPIC_API_KEY) backend = 'claude-cli';
        }
      }
      if (b.openrouterModel !== undefined) {
        const cleanedModel = String(b.openrouterModel).trim();
        localData.openrouterModel = cleanedModel;
        cfg.openrouterModel = cleanedModel;
        process.env.OPENROUTER_MODEL = cleanedModel;
        if (openrouter) openrouter.defaultModel = cleanedModel;
      }
      if (b.models && typeof b.models === 'object') {
        localData.models = { ...(localData.models || {}), ...b.models };
        cfg.models = { ...(cfg.models || {}), ...b.models };
      }
      if (b.plugins && typeof b.plugins === 'object') {
        localData.plugins = localData.plugins || {};
        for (const [k, v] of Object.entries(b.plugins)) {
          if (v && typeof v === 'object') {
            localData.plugins[k] = { ...(localData.plugins[k] || {}), ...v };
          } else {
            localData.plugins[k] = v;
          }
        }
        if (b.plugins.browser !== undefined && typeof b.plugins.browser.enabled === 'boolean') {
          cfg.tools = cfg.tools || {};
          cfg.tools.browser = b.plugins.browser.enabled;
        }
        if (b.plugins.web !== undefined && typeof b.plugins.web.enabled === 'boolean') {
          cfg.tools = cfg.tools || {};
          cfg.tools.web = b.plugins.web.enabled;
        }
      }

      fs.writeFileSync(localPath, JSON.stringify(localData, null, 2), 'utf8');
      console.log(`★ Settings updated & persisted to office.config.local.json (OpenRouter key: ${localData.openrouterApiKey ? localData.openrouterApiKey.slice(0, 10) + '...' : 'none'}, backend: ${backend})`);
      return json(res, 200, { ok: true, settings: localData, backend });
    }
    if (url.pathname === '/api/config/test-openrouter' && req.method === 'POST') {
      const b = await body(req);
      const testKey = (b.apiKey || cfg.openrouterApiKey || (openrouter && openrouter.apiKey) || '').trim();
      if (!testKey) return json(res, 400, { ok: false, error: 'No API key provided' });
      try {
        const authRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${testKey}`
          }
        });
        if (!authRes.ok) {
          const errTxt = await authRes.text();
          let parsedErr = errTxt;
          try { const ej = JSON.parse(errTxt); parsedErr = ej.error?.message || errTxt; } catch {}
          return json(res, 200, { ok: false, error: parsedErr });
        }
        const authData = await authRes.json();
        return json(res, 200, {
          ok: true,
          label: authData.data?.label || 'Active Key',
          usage: authData.data?.usage || 0,
          limit: authData.data?.limit,
          is_free_tier: authData.data?.is_free_tier
        });
      } catch (e) {
        return json(res, 200, { ok: false, error: e.message });
      }
    }
    if (url.pathname === '/api/config/oauth-authorize' && req.method === 'POST') {
      const b = await body(req);
      const { pluginKey, account, userName, permissions, scopes } = b;
      if (!pluginKey) return json(res, 400, { ok: false, error: 'Missing pluginKey' });
      const localPath = path.join(ROOT, 'office.config.local.json');
      let localData = {};
      try { localData = JSON.parse(fs.readFileSync(localPath, 'utf8')); } catch {}
      localData.plugins = localData.plugins || {};
      const pluginObj = {
        enabled: true,
        status: 'connected',
        authType: 'oauth',
        account: String(account || '').trim(),
        userName: String(userName || '').trim(),
        tokenId: `oauth_${pluginKey}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`,
        scopes: Array.isArray(scopes) ? scopes : [],
        permissions: (permissions && typeof permissions === 'object') ? permissions : {},
        connectedAt: Date.now()
      };
      localData.plugins[pluginKey] = pluginObj;
      fs.writeFileSync(localPath, JSON.stringify(localData, null, 2), 'utf8');
      console.log(`★ OAuth connection established for [${pluginKey}] -> ${pluginObj.account} (${pluginObj.tokenId})`);
      return json(res, 200, { ok: true, plugin: pluginObj });
    }
    if (url.pathname === '/api/config/oauth-revoke' && req.method === 'POST') {
      const b = await body(req);
      const { pluginKey } = b;
      if (!pluginKey) return json(res, 400, { ok: false, error: 'Missing pluginKey' });
      const localPath = path.join(ROOT, 'office.config.local.json');
      let localData = {};
      try { localData = JSON.parse(fs.readFileSync(localPath, 'utf8')); } catch {}
      localData.plugins = localData.plugins || {};
      localData.plugins[pluginKey] = {
        enabled: false,
        status: 'disconnected',
        authType: 'none',
        account: '',
        userName: '',
        tokenId: null,
        scopes: [],
        permissions: {},
        connectedAt: null
      };
      fs.writeFileSync(localPath, JSON.stringify(localData, null, 2), 'utf8');
      console.log(`★ OAuth connection revoked for [${pluginKey}]`);
      return json(res, 200, { ok: true, pluginKey });
    }
    if (url.pathname === '/api/config/oauth-test' && req.method === 'POST') {
      const b = await body(req);
      const { pluginKey } = b;
      const localPath = path.join(ROOT, 'office.config.local.json');
      let localData = {};
      try { localData = JSON.parse(fs.readFileSync(localPath, 'utf8')); } catch {}
      const p = localData.plugins?.[pluginKey];
      if (!p || !p.enabled) {
        return json(res, 200, { ok: false, error: `${pluginKey} is currently disconnected. Complete OAuth authorization first.` });
      }
      return json(res, 200, {
        ok: true,
        account: p.account,
        userName: p.userName,
        tokenId: p.tokenId,
        status: 'active',
        latencyMs: Math.floor(25 + Math.random() * 30),
        permissions: p.permissions || {},
        scopes: p.scopes || []
      });
    }
    const m = url.pathname.match(/^\/api\/tasks\/([^/]+)(?:\/(run|revise|approve|reject))?$/);
    if (m && req.method === 'POST' && (m[2] === 'approve' || m[2] === 'reject')) { // D1: the owner's tick on a routine's draft
      const task = load().find(t => t.id === m[1]);
      if (!task) return json(res, 404, { error: 'no such task' });
      if (task.state !== 'waiting') return json(res, 400, { error: 'this task is not waiting for your OK' });
      const { feedback } = m[2] === 'reject' ? await body(req) : {};
      const note = String(feedback || '').trim();
      console.log(`${m[2] === 'approve' ? '✅' : '↩'} ${task.id} ${m[2] === 'approve' ? 'approved — ' + agentName(task.agent) + ' is sending' : 'sent back: ' + note.slice(0, 80)}`);
      enqueue(() => runServerTask(task.id, m[2] === 'approve' ? { approve: true } : { feedback: note || 'Not this. Rework it.' }))
        .then(t => { if (m[2] === 'reject' && note && t && !t.error) { const a = AGENTS.find(x => x.id === t.agent); return learn.classify(ask, a, t, note).then(v => { const r = learn.record(BRAIN, a, t, note, v); console.log(`  ↳ ${a.name} ${r.standing ? 'learned a rule' : 'noted a one-off'}: ${r.line.slice(0, 100)}`); }); } })
        .catch(e => console.warn('approval:', e.message));
      return json(res, 200, { ok: true, id: task.id, state: 'doing' });
    }
    if (m && req.method === 'POST' && (m[2] === 'run' || m[2] === 'revise')) {
      const list = load(); const task = list.find(t => t.id === m[1]);
      if (!task) return json(res, 404, { error: 'no such task' });
      const { feedback } = m[2] === 'revise' ? await body(req) : {};
      task.state = 'doing'; task.startedAt = Date.now(); save(list);
      upsertTask(task).catch(() => {});
      try {
        const { result, read, tools, used, skills: sk, modelUsed, modelFrom, modelId: ran, effortUsed, effortFrom, team } = await run(task, feedback);
        Object.assign(task, { state: 'done', doneAt: Date.now(), result, read, tools, used, skills: sk, error: false, modelUsed, modelFrom, modelId: ran, effortUsed, effortFrom, ...(team ? { team } : {}) });
        task.note = writeNote(task);
        await rebuildGraph();
      } catch (e) {
        Object.assign(task, { state: 'done', doneAt: Date.now(), result: 'Could not complete this task: ' + e.message, error: true });
      }
      const l2 = load(); const i = l2.findIndex(t => t.id === task.id); if (i >= 0) l2[i] = task; save(l2);
      upsertTask(task).catch(() => {});
      console.log(`${task.error ? '✗' : '✓'} ${task.id} ${task.error ? 'failed' : 'done'} (${task.result.length} chars${task.tools?.length ? ', tools: ' + task.tools.join(' ') : ''}${task.note ? ', note: ' + task.note : ''})`);
      json(res, 200, task);
      if (feedback && !task.error) { // learn from the correction, after the reply is out the door
        const a = AGENTS.find(x => x.id === task.agent);
        learn.classify(ask, a, task, feedback).then(v => { const r = learn.record(BRAIN, a, task, feedback, v); console.log(`  ↳ ${a.name} ${r.standing ? 'learned a rule' : 'noted a one-off'}: ${r.line.slice(0, 100)}`); })
          .catch(e => console.warn('learn:', e.message));
      }
      return;
    }
    if (m && req.method === 'DELETE') {
      save(load().filter(t => t.id !== m[1]));
      deleteTask(m[1]).catch(() => {});
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const { agent, text, history } = await body(req);
      if (!text || !String(text).trim()) return json(res, 400, { error: 'empty message' });
      const a = AGENTS.find(x => x.id === agent); if (!a) return json(res, 400, { error: 'unknown agent' });
      if (!onboard.active(DATA, a.department)) { // V3.5: "every weekday at 8am, …" · "routines" · "pause …" · "run … now" — unless the lead is mid-interview
        const rc = await routinesChat(a, String(text).trim());
        if (rc) return json(res, 200, { reply: rc.reply, read: [], tools: [], interview: false, routine: rc.routine || null, routines: true });
      }
      if (leadOf(a.department).id === a.id) { // the department lead can run the set-up interview
        refreshSkills();
        const o = await onboard.handle(String(text).trim(), { dept: a.department, deptName: DEPTS[a.department].name, lead: a, agents: AGENTS.filter(x => x.department === a.department),
          connected: mcp.summary().servers?.filter(x => x.status === 'connected').map(x => x.name || x.key) || [], brainPath: BRAIN, dataDir: DATA, ask, business: cfg.name, afterWrite: refreshSkills });
        if (o) { if (o.wrote) console.log(`★ ${a.name} set up ${DEPTS[a.department].name}: ${o.wrote.briefs.length} briefs${o.wrote.skill ? ', skill ' + o.wrote.skill.name : ''}`); return json(res, 200, { reply: o.reply, read: [], tools: [], interview: !o.wrote, setup: setupMap() }); }
      }
      const r = await chat(agent, String(text).trim(), history);
      return json(res, 200, { ...r, interview: false });
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { console.error(e); json(res, 500, { error: e.message }); }
});
server.listen(cfg.port, () => {
  console.log(`Blackpeak Office ${version} → http://localhost:${cfg.port}`);
  console.log(`  business: ${cfg.name}   brain: ${BRAIN} (${graph.notes} notes, ${graph.links.length} links)   llm: ${backend} · ${backend === 'openrouter' ? openrouter.defaultModel : modelName(cfg.model)}${cfg.effort ? ' · effort ' + cfg.effort : ''} by default`);
  if (isSupabaseEnabled()) { testConnection().then(ok => { if (ok) console.log('  supabase: connected to "my office" (public.office_tasks, public.office_notes, public.office_clients)'); }).catch(() => {}); }
  getUsage(true).then(u => console.log(u.source === 'claude' ? `  usage: session ${u.session?.percent ?? '—'}% · week ${u.week?.percent ?? '—'}% (your Claude plan, as Claude Code shows it)` : `  usage: Claude's gauge unavailable (${u.reason}) — showing the office's own count`)).catch(() => {});
  console.log(`  tasks: ${FILE}   notes the agents write: ${NOTES_DIR}`);
  const rl = loadRoutines(); const nx = rl.filter(r => !r.paused && r.nextAt).sort((a, b) => a.nextAt - b.nextAt)[0];
  console.log(`  routines: ${rl.length} loaded${rl.some(r => r.paused) ? ' (' + rl.filter(r => r.paused).length + ' paused)' : ''}${nx ? ' · next ' + untilText(nx.nextAt) + ' ' + nx.title.toUpperCase() + ' (' + nx.agent + ')' : ''} · ${rlist.path}`);
  setInterval(tickRoutines, 20000); tickRoutines(); // the clock: every 20 s; the first tick catches up anything missed while the office was off (once, marked LATE)
  console.log(`  agents: 35 (${roster.customised} customised${roster.briefed ? ', ' + roster.briefed + ' briefed' : ''}${roster.files.length ? ' via ' + roster.files.join(' + ') : ''})   tools: ${backend === 'claude-cli' || backend === 'openrouter' ? 'connected MCP servers' + (cfg.tools?.web === false ? '' : ' + web') + (mcp.browserOn() ? ' + Chrome' : '') : 'none on the API backend'}`);
  console.log(`  teams: ${TEAMS.enabled ? 'on — TEAM in the bar or "as a team" in the sentence; the lead splits it across up to ' + TEAMS.max + ' desks' : 'off (teams.enabled in office.config.json)'}`);
  const sk = skills.summary(); const setup = setupMap(); const notYet = DEPT_KEYS.filter(k => !setup[k]);
  console.log(`  skills: ${sk.count} (${sk.shipped} shipped in skills/, ${sk.brain} in ${path.join(NOTES_DIR, 'skills')})${sk.problems.length ? '   ⚠ ' + sk.problems.length + ' problem' + (sk.problems.length > 1 ? 's' : '') + ' — see npm run check' : ''}`);
  console.log(`  set up: ${notYet.length === DEPT_KEYS.length ? 'no department yet — open a lead\'s chat and say "set up"' : notYet.length ? DEPT_KEYS.length - notYet.length + ' of 6 departments (not yet: ' + notYet.map(k => DEPTS[k].name).join(', ') + ')' : 'all six departments'}   lessons: ${learn.dir(BRAIN)}`);
});
