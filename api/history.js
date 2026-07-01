// api/history.js — Historial de conversaciones por sesión

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function dbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
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

  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });

  // Últimas 10 conversaciones de esta sesión
  const conversations = await dbFetch(
    `conversations?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.desc&limit=10`
  );

  if (!conversations.length) return res.status(200).json([]);

  const ids = conversations.map(c => c.id);
  const messages = await dbFetch(
    `messages?conversation_id=in.(${ids.join(',')})&order=created_at.asc`
  );

  const grouped = conversations.map(conv => ({
    ...conv,
    messages: messages.filter(m => m.conversation_id === conv.id)
  }));

  return res.status(200).json(grouped);
};
