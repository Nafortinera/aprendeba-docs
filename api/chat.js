// api/chat.js — AprendeBA Bot: chat con Gemini + historial en Supabase

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY       = process.env.GEMINI_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const SYSTEM_PROMPT = `Sos el asistente virtual de AprendeBA, la plataforma digital de gestión académica del Ministerio de Educación GCBA (Ciudad de Buenos Aires).

Ayudás a docentes, directivos y preceptores con:
- Acceso al sistema y autoregistración
- Matriculación de alumnos
- Registro de calificaciones
- Control de asistencia y justificaciones
- ECP (Estado de Cuenta Pedagógica)
- Agenda educativa y calendario escolar
- Permisos según rol (docente, directivo, preceptor)

Respondé siempre en español, de forma clara y concisa. Si el usuario tiene un problema técnico, indicale que puede contactar a Mesa de Ayuda en BA Colaborativa o llamar al 147 / 0800 999 2727 (lunes a viernes 8 a 18hs).

No inventes información. Si no sabés algo, decilo y sugerí contactar a soporte.`;

async function dbFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': (method === 'POST') ? 'return=representation' : 'return=representation'
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
    Object.entries(CORS_HEADERS).forEach(([k,v]) => res.setHeader(k,v));
    return res.status(200).end();
  }
  Object.entries(CORS_HEADERS).forEach(([k,v]) => res.setHeader(k,v));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, sessionId, conversationId, userName, userRole } = req.body || {};
  if (!message || !sessionId) {
    return res.status(400).json({ error: 'Se requieren message y sessionId' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({
      answer: 'La base de datos no está configurada. Contactá al administrador.',
      conversationId: null
    });
  }

  // Obtener o crear conversación
  let convId = conversationId;
  if (!convId) {
    const r = await dbFetch('conversations', 'POST', {
      session_id: sessionId,
      user_name: userName || null,
      user_role: userRole || 'docente'
    });
    if (!r.ok) return res.status(500).json({ error: 'Error DB al crear conversación' });
    convId = Array.isArray(r.data) ? r.data[0]?.id : r.data?.id;
  }

  // Guardar mensaje del usuario
  await dbFetch('messages', 'POST', {
    conversation_id: convId,
    role: 'user',
    content: message
  });

  // Llamar a Gemini
  let answer, source;
  try {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: message }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
        })
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) throw new Error(`Gemini ${geminiRes.status}: ${JSON.stringify(geminiData)}`);
    answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) throw new Error('Respuesta vacía');
    source = 'gemini';

  } catch (err) {
    console.error('Gemini error:', err.message);
    answer = 'En este momento no puedo procesar tu consulta con IA.\n\n' +
             'Contactá a Mesa de Ayuda de AprendeBA:\n' +
             '• BA Colaborativa\n' +
             '• Tel: 147 / 0800 999 2727\n' +
             '• Lunes a viernes 8 a 18hs';
    source = 'fallback'; 
  }

  // Guardar respuesta del asistente
  await dbFetch('messages', 'POST', {
    conversation_id: convId,
    role: 'assistant',
    content: answer,
    source
  });

  return res.status(200).json({ answer, conversationId: convId, source });
};
