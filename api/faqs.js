// api/faqs.js — CRUD de FAQs para el panel admin

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET         = process.env.ADMIN_SECRET;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

async function dbFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));

  // GET: cualquiera puede listar FAQs activas
  if (req.method === 'GET') {
    const r = await dbFetch('faqs?active=eq.true&order=category.asc,question.asc');
    return res.status(r.ok ? 200 : 500).json(r.data);
  }

  // Para escribir se necesita ADMIN_SECRET
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!ADMIN_SECRET || token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (req.method === 'POST') {
    const { category, question, answer, keywords } = req.body || {};
    if (!category || !question || !answer) {
      return res.status(400).json({ error: 'category, question y answer son requeridos' });
    }
    const r = await dbFetch('faqs', 'POST', {
      category, question, answer,
      keywords: keywords || [],
      active: true
    });
    return res.status(r.ok ? 201 : 500).json(r.data);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const r = await dbFetch(`faqs?id=eq.${id}`, 'PATCH', {
      ...updates,
      updated_at: new Date().toISOString()
    });
    return res.status(r.ok ? 200 : 500).json(r.data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    // Soft delete (marca como inactiva)
    const r = await dbFetch(`faqs?id=eq.${id}`, 'PATCH', { active: false });
    return res.status(r.ok ? 200 : 500).json({ success: true });
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
