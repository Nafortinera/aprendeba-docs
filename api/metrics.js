// api/metrics.js — Panel de métricas (solo admin)

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET         = process.env.ADMIN_SECRET;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

async function dbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return []; }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!ADMIN_SECRET || token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const [daily, topQ, roleStats] = await Promise.all([
    dbFetch('v_daily_metrics?limit=30'),
    dbFetch('v_top_questions?limit=10'),
    dbFetch('v_role_stats')
  ]);

  // Totales generales
  const totalConvRes = await fetch(`${SUPABASE_URL}/rest/v1/conversations?select=id`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'count=exact',
      'Range-Unit': 'items',
      'Range': '0-0'
    }
  });
  const totalConv = parseInt(totalConvRes.headers.get('content-range')?.split('/')?.[1] || '0');

  const totalMsgRes = await fetch(`${SUPABASE_URL}/rest/v1/messages?role=eq.user&select=id`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'count=exact',
      'Range-Unit': 'items',
      'Range': '0-0'
    }
  });
  const totalMsg = parseInt(totalMsgRes.headers.get('content-range')?.split('/')?.[1] || '0');

  return res.status(200).json({
    totals: { conversations: totalConv, questions: totalMsg },
    daily,
    topQuestions: topQ,
    roleStats
  });
};
