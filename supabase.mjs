// Agents Office — Supabase Real-Time Client (Zero external dependencies)
// Connects to your "my office" Supabase project: https://fhjjwcdooeddsowaqqpw.supabase.co
import { loadConfig } from './config.mjs';

const cfg = loadConfig();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fhjjwcdooeddsowaqqpw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_Vljnu2jzHmnIQdeJbbU2Tw_Ty1serob';

function headers() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

/** Check database connection */
export async function testConnection() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_tasks?select=count`, {
      method: 'HEAD',
      headers: headers(),
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

/** Get all tasks from Supabase (optionally filtered by user_id) */
export async function getTasks(userId = null) {
  try {
    const filter = userId ? `&user_id=eq.${userId}` : '';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_tasks?select=*${filter}&order=created_at.desc`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      text: r.text,
      dept: r.department,
      department: r.department,
      agent: r.agent,
      state: r.state,
      plan: r.plan || [],
      result: r.result,
      tools: r.tools || [],
      user_id: r.user_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      ...(r.metadata || {})
    }));
  } catch {
    return [];
  }
}

/** Upsert a task to Supabase with user_id */
export async function upsertTask(task, userId = null) {
  try {
    const uid = userId || task.user_id || process.env.SUPABASE_USER_ID || null;
    const body = {
      id: String(task.id),
      title: String(task.title || ''),
      text: String(task.text || ''),
      department: String(task.department || task.dept || ''),
      agent: String(task.agent || ''),
      state: String(task.state || 'next'),
      plan: task.plan || [],
      result: task.result || null,
      tools: task.tools || [],
      metadata: {
        eta: task.eta,
        why: task.why,
        addedAt: task.addedAt,
        changedAt: task.changedAt,
        startedAt: task.startedAt,
        doneAt: task.doneAt,
        dueAt: task.dueAt,
        due: task.due,
        late: task.late,
        progress: task.progress,
        error: task.error,
        model: task.model,
        effort: task.effort,
        modelUsed: task.modelUsed,
        effortUsed: task.effortUsed,
        team: task.team,
        routine: task.routine,
        when: task.when,
        needsOk: task.needsOk,
        ask: task.ask,
        draft: task.draft,
        by: task.by
      },
      updated_at: new Date().toISOString(),
    };
    if (uid) body.user_id = uid;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_tasks`, {
      method: 'POST',
      headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete a task from Supabase */
export async function deleteTask(taskId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_tasks?id=eq.${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Get client records from Supabase (optionally filtered by user_id) */
export async function getClients(userId = null) {
  try {
    const filter = userId ? `&user_id=eq.${userId}` : '';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_clients?select=*${filter}&order=created_at.desc`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** Insert a client record into Supabase with user_id */
export async function addClient({ name, company = '', email = '', phone = '', status = 'lead', notes = '', user_id = null }) {
  try {
    const uid = user_id || process.env.SUPABASE_USER_ID || null;
    const payload = { name, company, email, phone, status, notes };
    if (uid) payload.user_id = uid;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_clients`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Save an agent note / deliverable to Supabase with user_id */
export async function saveNote({ title, category = 'deliverable', content, author_agent = '', user_id = null }) {
  try {
    const uid = user_id || process.env.SUPABASE_USER_ID || null;
    const payload = { title, category, content, author_agent };
    if (uid) payload.user_id = uid;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_notes`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Get notes from Supabase */
export async function getNotes(userId = null) {
  try {
    const filter = userId ? `&user_id=eq.${userId}` : '';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_notes?select=*${filter}&order=created_at.desc`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** Get routines from Supabase */
export async function getRoutines(userId = null) {
  try {
    const filter = userId ? `&user_id=eq.${userId}` : '';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_routines?select=*${filter}&order=created_at.desc`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** Upsert routine to Supabase */
export async function upsertRoutine(r, userId = null) {
  try {
    const uid = userId || r.user_id || process.env.SUPABASE_USER_ID || null;
    const body = {
      id: String(r.id),
      department: String(r.dept || r.department || ''),
      agent: String(r.agent || ''),
      title: String(r.title || ''),
      cadence: String(r.when || r.cadence || ''),
      needs_ok: r.needsOk !== false,
      paused: !!r.paused,
      last_run_at: r.lastAt ? new Date(r.lastAt).toISOString() : null,
      next_run_at: r.nextAt ? new Date(r.nextAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    if (uid) body.user_id = uid;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_routines`, {
      method: 'POST',
      headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete routine from Supabase */
export async function deleteRoutine(routineId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/office_routines?id=eq.${encodeURIComponent(routineId)}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Compute aggregated metrics across tasks, notes, and clients from Supabase */
export async function getRealStats(userId = null) {
  try {
    const [tasks, notes, clients] = await Promise.all([
      getTasks(userId),
      getNotes(userId),
      getClients(userId)
    ]);

    const doneByDept = d => tasks.filter(t => (t.dept === d || t.department === d) && t.state === 'done').length;
    const waitByDept = d => tasks.filter(t => (t.dept === d || t.department === d) && (t.state === 'waiting' || t.state === 'doing' || t.state === 'next')).length;
    
    const emailsDone = doneByDept('emails');
    const emailsDrafts = waitByDept('emails');
    const deliveryDone = doneByDept('delivery');
    const ceoDone = doneByDept('ceo');
    const ceoDirectives = ceoDone;
    const ceoReports = notes.filter(n => n.department === 'ceo' || n.category === 'executive' || n.category === 'briefing').length + tasks.filter(t => t.by === 'ceo' && t.state === 'done').length;
    const activeClients = clients.filter(c => c.status === 'active' || c.status === 'onboarded').length;
    const leadClients = clients.filter(c => c.status === 'lead').length;

    const spencerTasks = tasks.filter(t => (t.agent === 'spencer' || t.agent === 'enzo') && t.state === 'done').length;
    const arwinTasks = tasks.filter(t => (t.agent === 'arwin' || t.agent === 'pros') && t.state === 'done').length;
    const jackTasks = tasks.filter(t => (t.agent === 'jack' || t.agent === 'piper') && t.state === 'done').length;

    const insMkt = notes.filter(n => n.category === 'insight' || n.category === 'marketing' || n.department === 'marketing').length + doneByDept('marketing');
    const insOps = notes.filter(n => n.category === 'compliance' || n.category === 'operations' || n.category === 'sop' || n.department === 'ops').length + doneByDept('ops');
    const proposals = notes.filter(n => n.category === 'proposal').length + tasks.filter(t => (t.agent === 'piper' || t.dept === 'ops' || t.department === 'ops') && t.state === 'done').length;
    const invoices = notes.filter(n => n.category === 'invoice' || n.department === 'fin').length + doneByDept('fin');
    const billsPaid = tasks.filter(t => (t.dept === 'fin' || t.department === 'fin') && t.state === 'done').length;

    const deliveryTotal = clients.length > 0 ? clients.length : tasks.filter(t => t.dept === 'delivery' || t.department === 'delivery').length;
    const deliveryOnTrack = clients.length > 0 ? activeClients : tasks.filter(t => (t.dept === 'delivery' || t.department === 'delivery') && (t.state === 'doing' || t.state === 'done')).length;

    return {
      ceoDirectives,
      ceoReports,
      emailsSent: emailsDone,
      drafts: emailsDrafts,
      reports: deliveryDone,
      projects: deliveryTotal,
      onTrack: deliveryOnTrack,
      spencer: spencerTasks,
      arwin: arwinTasks,
      jack: jackTasks,
      managers: leadClients,
      autoOnb: activeClients,
      insMkt,
      cpa: 0,
      proposals,
      insOps,
      invoices,
      billsPaid,
      brainNotes: notes.length,
      tasksCount: tasks.length,
      notesCount: notes.length,
      clientsCount: clients.length
    };
  } catch (err) {
    return null;
  }
}

/** Supabase Auth: Sign Up user */
export async function authSignUp({ email, password, full_name = '' }) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password, data: { full_name } }),
    });
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

/** Supabase Auth: Sign In with Email & Password */
export async function authSignIn({ email, password }) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    });
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

/** Supabase Auth: Get User Profile by ID */
export async function getProfile(userId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data[0] || null;
  } catch {
    return null;
  }
}
