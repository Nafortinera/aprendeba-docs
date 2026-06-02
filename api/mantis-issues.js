// api/mantis-issues.js — Vercel Serverless Function
// Credenciales desde variables de entorno de Vercel

const https = require('https');
const http  = require('http');
const url   = require('url');

const MANTIS_URL = (process.env.MANTIS_URL || 'https://mantis.bue.edu.ar').replace(/\/$/, '');
const USERNAME   = process.env.MANTIS_USERNAME || '';
const PASSWORD   = process.env.MANTIS_PASSWORD || '';
const PROJECT_ID = process.env.MANTIS_PROJECT  || '0';

function request(reqUrl, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(reqUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   opts.method || 'GET',
      headers:  opts.headers || {},
    };
    const req = lib.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function parseCookies(hdrs = []) {
  if (!Array.isArray(hdrs)) hdrs = [hdrs];
  const jar = {};
  for (const h of hdrs.filter(Boolean)) {
    const p = h.split(';')[0], i = p.indexOf('=');
    if (i > 0) jar[p.slice(0,i).trim()] = p.slice(i+1).trim();
  }
  return jar;
}
const cookieStr = jar => Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');

async function login() {
  let jar = {};
  try { const r = await request(`${MANTIS_URL}/login_page.php`); jar = parseCookies(r.headers['set-cookie']); } catch(_) {}
  const body = new url.URLSearchParams({ username: USERNAME, password: PASSWORD, return: 'index.php', secure_session: 'off', perm_login: 'on' }).toString();
  const r1 = await request(`${MANTIS_URL}/login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), 'Cookie': cookieStr(jar), 'User-Agent': 'Mozilla/5.0 AprendeBA/1.0', 'Referer': `${MANTIS_URL}/login_page.php`, 'Origin': MANTIS_URL },
    body,
  });
  jar = { ...jar, ...parseCookies(r1.headers['set-cookie']) };
  if (r1.status >= 300 && r1.status < 400 && r1.headers.location) {
    const rUrl = r1.headers.location.startsWith('http') ? r1.headers.location : `${MANTIS_URL}/${r1.headers.location.replace(/^\//,'')}`;
    const r2 = await request(rUrl, { headers: { 'Cookie': cookieStr(jar), 'User-Agent': 'Mozilla/5.0 AprendeBA/1.0' } });
    jar = { ...jar, ...parseCookies(r2.headers['set-cookie']) };
  }
  if (!Object.keys(jar).length) throw new Error('Sin cookies tras login');
  return jar;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l=>l.trim());
  if (lines.length < 2) return [];
  const splitLine = line => { const f=[]; let c='',q=false; for(const ch of line){if(ch==='"'){q=!q}else if(ch===','&&!q){f.push(c);c=''}else c+=ch}; f.push(c); return f.map(x=>x.trim()); };
  const headers = splitLine(lines[0]);
  const g = (row,...keys) => { for(const k of keys){if(row[k]!==undefined&&row[k]!=='')return row[k]}return ''; };
  return lines.slice(1).map(line => {
    const vals=splitLine(line); const row={}; headers.forEach((h,i)=>row[h]=vals[i]||'');
    const id=g(row,'Id','ID','Bug Id'); if(!id) return null;
    return { id, proyecto:g(row,'Project','Proyecto'), categoria:g(row,'Category','Categoría'), prioridad:g(row,'Priority','Prioridad'), estado:g(row,'Status','Estado'), resolucion:g(row,'Resolution','Resolución'), asignado_a:g(row,'Assigned To','Asignado a'), resumen:g(row,'Summary','Resumen'), descripcion:g(row,'Description','Descripción'), fecha:g(row,'Date Submitted','Fecha','Created'), actualizado:g(row,'Updated','Last Updated','Actualizado'), reporter:g(row,'Reporter','Informante'), url:`${MANTIS_URL}/view.php?id=${id}` };
  }).filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!USERNAME || !PASSWORD) return res.status(503).json({ error: 'Variables MANTIS_USERNAME y MANTIS_PASSWORD no configuradas' });

  try {
    const jar    = await login();
    const csvReq = await request(`${MANTIS_URL}/csv_export.php?project_id=${PROJECT_ID}&type=1`, {
      headers: { 'Cookie': cookieStr(jar), 'User-Agent': 'Mozilla/5.0 AprendeBA/1.0', 'Referer': `${MANTIS_URL}/view_all_bug_page.php` }
    });
    const text = csvReq.body.toString('utf-8');
    if (text.trimStart().startsWith('<!') || text.includes('<html')) throw new Error('Sesión inválida');
    const issues  = parseCSV(text);
    const isClosed = e => { const s=(e||'').toLowerCase(); return s.includes('cerr')||s.includes('clos')||s.includes('resuel')||s.includes('resolv'); };
    const total   = issues.length;
    const cerrados = issues.filter(i=>isClosed(i.estado)).length;
    res.json({ total, abiertos: total-cerrados, cerrados, pct_resolucion: total ? Math.round(cerrados/total*1000)/10 : 0, issues });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};
