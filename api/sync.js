// api/sync.js — Vercel Function: sync de estado y tickets via GitHub
// Lee/escribe archivos JSON en el repo como storage compartido del equipo

const https = require('https');

const OWNER  = 'Nafortinera';
const REPO   = 'aprendeba-docs';
const TOKEN  = process.env.GITHUB_TOKEN || '';
const BRANCH = 'main';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent': 'AprendeBA-Hub/1.0',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function readFile(filename) {
  const r = await ghRequest('GET', `/repos/${OWNER}/${REPO}/contents/data/${filename}`);
  if (r.status === 404) return { content: null, sha: null };
  const content = Buffer.from(r.body.content.replace(/\n/g,''), 'base64').toString('utf-8');
  return { content: JSON.parse(content), sha: r.body.sha };
}

async function writeFile(filename, data, sha) {
  const content = Buffer.from(JSON.stringify(data)).toString('base64');
  const body = { message: `Update ${filename}`, content, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await ghRequest('PUT', `/repos/${OWNER}/${REPO}/contents/data/${filename}`, body);
  return r.status === 200 || r.status === 201;
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query; // ?type=state or ?type=tickets

  if (!type || !['state','tickets','history'].includes(type)) {
    return res.status(400).json({ error: 'type must be state or tickets' });
  }

  const filename = type === 'state' ? 'state.json' : type === 'history' ? 'history.json' : 'tickets.json';

  if (req.method === 'GET') {
    try {
      const { content } = await readFile(filename);
      return res.json(content || (type === 'state' ? {} : []));
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const newData = JSON.parse(body);
      const { sha } = await readFile(filename);
      await writeFile(filename, newData, sha);
      return res.json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
