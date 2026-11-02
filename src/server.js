import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 4173);
const dbPath = resolve('data/db.json');
const initial = {
  tasks: [
    {id:'task-001',title:'Add a Soroban contract test fixture',repo:'sorowave/contracts',category:'contracts',level:'Good first issue',reward:100,status:'Open'},
    {id:'task-002',title:'Build a Stellar address validation helper',repo:'sorowave/api',category:'developer-tools',level:'Small feature',reward:150,status:'Open'},
    {id:'task-003',title:'Document a testnet payment walkthrough',repo:'sorowave/app',category:'payments',level:'Good first issue',reward:100,status:'Open'},
    {id:'task-004',title:'Show application status on task cards',repo:'sorowave/app',category:'developer-tools',level:'Small feature',reward:150,status:'Open'}
  ], applications: []
};

async function readDb() {
  try { return JSON.parse(await readFile(dbPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(dirname(dbPath), {recursive:true});
    await writeFile(dbPath, JSON.stringify(initial, null, 2));
    return structuredClone(initial);
  }
}
async function saveDb(db) { await mkdir(dirname(dbPath), {recursive:true}); await writeFile(dbPath, JSON.stringify(db, null, 2)); }
function send(res, status, data) { res.writeHead(status, {'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}); res.end(JSON.stringify(data)); }
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) throw new Error('Request body too large.'); }
  return JSON.parse(raw || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}); return res.end(); }
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, {ok:true,name:'sorowave-api'});
    if (req.method === 'GET' && url.pathname === '/tasks') {
      const db = await readDb(); const category = url.searchParams.get('category');
      return send(res, 200, {tasks:db.tasks.filter(task => task.status === 'Open' && (!category || task.category === category))});
    }
    if (req.method === 'POST' && url.pathname === '/tasks') {
      const input = await body(req);
      if (typeof input.title !== 'string' || input.title.trim().length < 8 || typeof input.repo !== 'string' || !input.repo.includes('/')) return send(res, 400, {error:'Provide a task title (at least 8 characters) and repo in org/name form.'});
      const db = await readDb(); const task = {id:randomUUID(),title:input.title.trim(),repo:input.repo.trim(),category:['contracts','developer-tools','payments'].includes(input.category)?input.category:'developer-tools',level:['Good first issue','Small feature','Advanced'].includes(input.level)?input.level:'Good first issue',reward:[100,150,200].includes(Number(input.reward))?Number(input.reward):100,status:'Open'};
      db.tasks.unshift(task); await saveDb(db); return send(res, 201, {task});
    }
    if (req.method === 'GET' && url.pathname === '/applications') { const db = await readDb(); return send(res, 200, {applications:db.applications}); }
    if (req.method === 'POST' && url.pathname === '/applications') {
      const input = await body(req);
      if (typeof input.taskId !== 'string' || typeof input.applicant !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(input.applicant) || typeof input.message !== 'string' || input.message.trim().length < 20 || input.message.length > 3000) return send(res, 400, {error:'Provide a task, a valid GitHub username, and a message of 20–3000 characters.'});
      const db = await readDb(); const task = db.tasks.find(item => item.id === input.taskId && item.status === 'Open');
      if (!task) return send(res, 404, {error:'Open task not found.'});
      if (db.applications.some(item => item.taskId === task.id && item.applicant.toLowerCase() === input.applicant.toLowerCase())) return send(res, 409, {error:'You already applied to this task.'});
      const application = {id:randomUUID(),taskId:task.id,taskTitle:task.title,applicant:input.applicant,message:input.message.trim(),status:'Pending',createdAt:new Date().toISOString()};
      db.applications.push(application); await saveDb(db); return send(res, 201, {application});
    }
    return send(res, 404, {error:'Route not found.'});
  } catch (error) { return send(res, error instanceof SyntaxError ? 400 : 500, {error:error instanceof SyntaxError ? 'Request body must be valid JSON.' : 'Unexpected server error.'}); }
});
server.listen(port, () => console.log(`SoroWave API listening at http://localhost:${port}`));
