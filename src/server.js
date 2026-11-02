import 'dotenv/config';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 4173);
const dbPath = resolve('data/db.json');
const testnet = {
  network: 'testnet',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  friendbotUrl: 'https://friendbot.stellar.org',
  contractId: process.env.SOROWAVE_CONTRACT_ID || '',
  tokenContractId: process.env.SOROWAVE_TOKEN_CONTRACT_ID || '',
  waveId: process.env.SOROWAVE_WAVE_ID || ''
};

const previewWave = {
  id: 'sorowave-community-preview',
  program: 'SoroWave Community',
  title: 'Community Preview Cycle',
  status: 'preview',
  startsAt: null,
  endsAt: null,
  rewardPool: null,
  rewardAsset: null,
  description: 'A preview cycle for trying the contribution workflow. It is not an official Drips Wave and has no funded reward pool.'
};

const starterTasks = [
  { id: 'task-app-search', title: 'Add keyword search to the task board', description: 'Let contributors search task titles, repository names, and issue descriptions. Keep the search usable on mobile and announce the result count to assistive technology.', repo: 'SoroWave/sorowave-app', issueNumber: 1, category: 'developer-tools', complexity: 'Medium', points: 150 },
  { id: 'task-api-pagination', title: 'Add pagination to GET /tasks', description: 'Add stable page and page-size parameters to the task endpoint. Return pagination metadata and keep the default response bounded.', repo: 'SoroWave/sorowave-api', issueNumber: 1, category: 'developer-tools', complexity: 'Medium', points: 150 },
  { id: 'task-contract-lifecycle', title: 'Add Soroban tests for the bounty lifecycle', description: 'Cover contract initialization, bounty creation, release, cancellation, authorization failures, and invalid state transitions with Soroban test utilities.', repo: 'SoroWave/sorowave-contracts', issueNumber: 1, category: 'contracts', complexity: 'High', points: 200 }
].map(task => ({ ...task, issueUrl: `https://github.com/${task.repo}/issues/${task.issueNumber}`, waveId: previewWave.id, status: 'Open', createdAt: '2026-11-02T00:00:00.000Z' }));

const initial = { waves: [previewWave], tasks: starterTasks, applications: [] };

async function readDb() {
  try {
    const db = JSON.parse(await readFile(dbPath, 'utf8'));
    db.waves ||= [previewWave];
    if (db.waves.length === 0) db.waves.push(previewWave);
    db.tasks ||= starterTasks;
    db.applications ||= [];
    db.tasks = db.tasks.map(task => {
      let repo = task.repo || 'SoroWave/sorowave-app';
      if (/^sorowave\//i.test(repo)) repo = `SoroWave/sorowave-${repo.split('/')[1]}`;
      const complexity = task.complexity || (task.level === 'Advanced' ? 'High' : task.level === 'Small feature' ? 'Medium' : 'Trivial');
      const issueNumber = task.issueNumber || Number(task.issueUrl?.match(/\/issues\/(\d+)/)?.[1]) || 1;
      return {
        ...task,
        repo,
        issueNumber,
        issueUrl: task.issueUrl || `https://github.com/${repo}/issues/${issueNumber}`,
        waveId: task.waveId || previewWave.id,
        complexity,
        points: task.points || pointsFor(complexity)
      };
    });
    db.applications = db.applications.map(item => {
      const task = db.tasks.find(candidate => candidate.id === item.taskId);
      return { ...item, waveId: item.waveId || task?.waveId || previewWave.id, repo: item.repo || task?.repo || '', issueNumber: item.issueNumber || task?.issueNumber, prUrl: item.prUrl || null, pointsAwarded: item.pointsAwarded || 0, updatedAt: item.updatedAt || item.createdAt };
    });
    return db;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(initial, null, 2));
    return structuredClone(initial);
  }
}

async function saveDb(db) {
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error('Request body too large.');
  }
  return JSON.parse(raw || '{}');
}

function pointsFor(complexity) {
  return ({ Trivial: 100, Medium: 150, High: 200 })[complexity] || 100;
}

function validRepoIssue(input) {
  if (typeof input.repo !== 'string' || typeof input.issueUrl !== 'string') return null;
  const repo = input.repo.trim();
  const match = input.issueUrl.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/(\d+)(?:\?.*)?$/);
  if (!match || `${match[1]}/${match[2]}`.toLowerCase() !== repo.toLowerCase()) return null;
  return { repo, issueNumber: Number(match[3]), issueUrl: `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}` };
}

async function fetchPublicIssue(issue) {
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${issue.repo}/issues/${issue.issueNumber}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'SoroWave-Community-Preview', 'x-github-api-version': '2022-11-28' }
    });
  } catch { return { error: 'GitHub issue verification is unavailable. Try again later.', status: 502 }; }
  if (response.status === 404) return { error: 'GitHub could not find that public issue.', status: 404 };
  if (response.status === 403 || response.status === 429) return { error: 'GitHub is rate limiting issue lookups. Try again later.', status: 503 };
  if (!response.ok) return { error: 'Could not verify this GitHub issue right now.', status: 502 };
  const data = await response.json();
  if (data.pull_request) return { error: 'Link to a GitHub issue, not a pull request.', status: 400 };
  if (data.state !== 'open') return { error: 'Only open GitHub issues can be added to a preview cycle.', status: 409 };
  return { data };
}

function isWalletAddress(address) {
  return typeof address === 'string' && /^G[A-Z2-7]{55}$/.test(address);
}

function isGithubHandle(handle) {
  return typeof handle === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(handle);
}

function validPullRequestUrl(value, repo) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?:\?.*)?$/);
  if (!match || `${match[1]}/${match[2]}`.toLowerCase() !== repo.toLowerCase()) return null;
  return { repo, number: Number(match[3]), url: `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}` };
}

async function fetchPublicPullRequest(pull, issueNumber) {
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${pull.repo}/pulls/${pull.number}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'SoroWave-Community-Preview', 'x-github-api-version': '2022-11-28' }
    });
  } catch { return { error: 'GitHub pull request verification is unavailable. Try again later.', status: 502 }; }
  if (response.status === 404) return { error: 'GitHub could not find that public pull request.', status: 404 };
  if (response.status === 403 || response.status === 429) return { error: 'GitHub is rate limiting pull request lookups. Try again later.', status: 503 };
  if (!response.ok) return { error: 'Could not verify this GitHub pull request right now.', status: 502 };
  const data = await response.json();
  if (`${data.base?.repo?.full_name || ''}`.toLowerCase() !== pull.repo.toLowerCase()) return { error: 'This pull request targets a different repository.', status: 400 };
  const closesIssue = new RegExp(`(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\\s+#${issueNumber}\\b`, 'i').test(data.body || '');
  if (!closesIssue) return { error: `The pull request description must include “Closes #${issueNumber}” or an equivalent GitHub keyword.`, status: 400 };
  return { data };
}

function routeId(pathname, prefix) {
  try { return decodeURIComponent(pathname.slice(prefix.length)); }
  catch { return ''; }
}

async function checkStellarEndpoint(name, url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    const rpcError = payload.error?.message;
    const rpcHealthy = name !== 'Soroban RPC' || payload.result?.status === 'healthy';
    return {
      name,
      status: response.ok && !rpcError && rpcHealthy ? 'online' : 'degraded',
      detail: !response.ok ? `HTTP ${response.status}` : rpcError || (!rpcHealthy ? 'RPC did not report a healthy state.' : 'Responding')
    };
  } catch (error) {
    return {
      name,
      status: 'offline',
      detail: error.name === 'AbortError' ? 'Timed out after 4 seconds' : 'Could not reach endpoint'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function stellarStatus() {
  const [horizon, rpc] = await Promise.all([
    checkStellarEndpoint('Horizon', `${testnet.horizonUrl}/`, { headers: { accept: 'application/json' } }),
    checkStellarEndpoint('Soroban RPC', testnet.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
    })
  ]);
  const services = [horizon, rpc];
  return {
    network: testnet.network,
    checkedAt: new Date().toISOString(),
    status: services.every(service => service.status === 'online') ? 'healthy' : 'degraded',
    services,
    contracts: {
      pool: testnet.contractId ? 'configured' : 'not-configured',
      token: testnet.tokenContractId ? 'configured' : 'not-configured'
    }
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, name: 'sorowave-api' });
    if (req.method === 'GET' && url.pathname === '/stellar/config') return send(res, 200, testnet);
    if (req.method === 'GET' && url.pathname === '/stellar/status') return send(res, 200, await stellarStatus());

    if (req.method === 'GET' && url.pathname.startsWith('/stellar/accounts/')) {
      const address = routeId(url.pathname, '/stellar/accounts/');
      if (!isWalletAddress(address)) return send(res, 400, { error: 'Invalid Stellar public key.' });
      const response = await fetch(`${testnet.horizonUrl}/accounts/${encodeURIComponent(address)}`);
      if (response.status === 404) return send(res, 200, { funded: false, address, balances: [] });
      if (response.status === 400) return send(res, 400, { error: 'Invalid Stellar public key.' });
      if (!response.ok) return send(res, 502, { error: 'Stellar Horizon is unavailable.' });
      const account = await response.json();
      return send(res, 200, {
        funded: true,
        address,
        balances: account.balances.map(item => ({ asset: item.asset_type === 'native' ? 'XLM' : `${item.asset_code}:${item.asset_issuer}`, balance: item.balance }))
      });
    }

    if (req.method === 'GET' && url.pathname === '/waves') {
      const db = await readDb();
      const waves = db.waves.map(wave => ({
        ...wave,
        issues: db.tasks.filter(task => task.waveId === wave.id).length,
        activeIssues: db.tasks.filter(task => task.waveId === wave.id && ['Open', 'Assigned'].includes(task.status)).length,
        completedIssues: db.tasks.filter(task => task.waveId === wave.id && task.status === 'Completed').length,
        pointsAvailable: db.tasks.filter(task => task.waveId === wave.id && !['Completed', 'Cancelled'].includes(task.status)).reduce((sum, task) => sum + task.points, 0)
      }));
      return send(res, 200, { waves });
    }

    if (req.method === 'GET' && url.pathname === '/github/issue') {
      const issue = validRepoIssue({ issueUrl: url.searchParams.get('url'), repo: url.searchParams.get('url')?.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\//)?.[1] });
      if (!issue) return send(res, 400, { error: 'Provide a public GitHub issue URL.' });
      const result = await fetchPublicIssue(issue);
      return result.error ? send(res, result.status, { error: result.error }) : send(res, 200, { issue: { title: result.data.title, body: result.data.body || '', url: result.data.html_url, repository: issue.repo, number: issue.issueNumber } });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/waves/')) {
      const id = routeId(url.pathname, '/waves/');
      const db = await readDb();
      const wave = db.waves.find(item => item.id === id);
      if (!wave) return send(res, 404, { error: 'Wave not found.' });
      const tasks = db.tasks.filter(task => task.waveId === id);
      return send(res, 200, { wave, tasks });
    }

    if (req.method === 'GET' && url.pathname === '/tasks') {
      const db = await readDb();
      const category = url.searchParams.get('category');
      const waveId = url.searchParams.get('waveId');
      const showAll = url.searchParams.get('all') === 'true';
      const status = url.searchParams.get('status');
      const search = (url.searchParams.get('q') || '').trim().toLowerCase();
      const page = Number(url.searchParams.get('page') || 1);
      const pageSize = Number(url.searchParams.get('limit') || 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        return send(res, 400, { error: 'page must be a positive integer and limit must be between 1 and 100.' });
      }
      const matching = db.tasks.filter(task =>
        (showAll || task.status === 'Open') &&
        (!category || task.category === category) &&
        (!waveId || task.waveId === waveId) &&
        (!status || task.status === status) &&
        (!search || `${task.title} ${task.repo} ${task.description}`.toLowerCase().includes(search))
      );
      const offset = (page - 1) * pageSize;
      return send(res, 200, {
        tasks: matching.slice(offset, offset + pageSize),
        pagination: { page, pageSize, total: matching.length, totalPages: Math.ceil(matching.length / pageSize) }
      });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/tasks/')) {
      const id = routeId(url.pathname, '/tasks/');
      const db = await readDb();
      const task = db.tasks.find(item => item.id === id);
      return task ? send(res, 200, { task }) : send(res, 404, { error: 'Task not found.' });
    }

    if (req.method === 'POST' && url.pathname === '/tasks') {
      const input = await readBody(req);
      const issue = validRepoIssue(input);
      if (!issue) return send(res, 400, { error: 'Provide a valid public GitHub issue URL.' });
      const verified = await fetchPublicIssue(issue);
      if (verified.error) return send(res, verified.status, { error: verified.error });
      const title = verified.data.title;
      if ((input.title && input.title.trim() !== title) || title.length < 8 || title.length > 120 || typeof input.description !== 'string' || input.description.trim().length < 40 || input.description.length > 4000) {
        return send(res, 400, { error: 'Provide a task title (8–120 characters), a matching GitHub issue URL, and a clear scope (40–4000 characters).' });
      }
      const db = await readDb();
      if (db.tasks.some(task => task.issueUrl.toLowerCase() === issue.issueUrl.toLowerCase())) return send(res, 409, { error: 'That GitHub issue is already listed.' });
      const complexity = ['Trivial', 'Medium', 'High'].includes(input.complexity) ? input.complexity : 'Trivial';
      const task = {
        id: randomUUID(),
        title,
        description: input.description.trim(),
        ...issue,
        waveId: db.waves[0]?.id || previewWave.id,
        category: ['contracts', 'developer-tools', 'payments'].includes(input.category) ? input.category : 'developer-tools',
        complexity,
        points: pointsFor(complexity),
        status: 'Open',
        createdAt: new Date().toISOString()
      };
      db.tasks.unshift(task);
      await saveDb(db);
      return send(res, 201, { task });
    }

    if (req.method === 'GET' && url.pathname === '/applications') {
      const db = await readDb();
      const applicant = url.searchParams.get('applicant');
      const waveId = url.searchParams.get('waveId');
      const applications = db.applications.filter(item =>
        (!applicant || item.applicant.toLowerCase() === applicant.toLowerCase()) &&
        (!waveId || item.waveId === waveId)
      );
      return send(res, 200, { applications });
    }

    if (req.method === 'POST' && url.pathname === '/applications') {
      const input = await readBody(req);
      if (typeof input.taskId !== 'string' || !isGithubHandle(input.applicant) || typeof input.message !== 'string' || input.message.trim().length < 20 || input.message.length > 3000 || (input.walletAddress && !isWalletAddress(input.walletAddress))) {
        return send(res, 400, { error: 'Provide an open issue, a valid GitHub username, an optional Stellar G address, and a message of 20–3000 characters.' });
      }
      const db = await readDb();
      const task = db.tasks.find(item => item.id === input.taskId && item.status === 'Open');
      if (!task) return send(res, 404, { error: 'Open issue not found.' });
      if (db.applications.some(item => item.taskId === task.id && item.applicant.toLowerCase() === input.applicant.toLowerCase())) return send(res, 409, { error: 'You already applied to this issue.' });
      const pendingCount = db.applications.filter(item => item.applicant.toLowerCase() === input.applicant.toLowerCase() && item.waveId === task.waveId && item.status === 'Pending').length;
      if (pendingCount >= 15) return send(res, 409, { error: 'You have reached the 15 pending application limit for this preview cycle.' });
      const application = {
        id: randomUUID(), taskId: task.id, waveId: task.waveId, taskTitle: task.title, repo: task.repo, issueNumber: task.issueNumber,
        applicant: input.applicant, walletAddress: input.walletAddress || null,
        message: input.message.trim(), status: 'Pending', prUrl: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pointsAwarded: 0
      };
      db.applications.push(application);
      await saveDb(db);
      return send(res, 201, { application });
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/applications/')) {
      const id = routeId(url.pathname, '/applications/');
      const input = await readBody(req);
      const db = await readDb();
      const application = db.applications.find(item => item.id === id);
      if (!application) return send(res, 404, { error: 'Application not found.' });
      const task = db.tasks.find(item => item.id === application.taskId);

      if (input.prUrl !== undefined) {
        if (application.status !== 'Assigned') return send(res, 409, { error: 'A pull request can only be submitted for an assigned issue.' });
        const pull = validPullRequestUrl(input.prUrl, application.repo);
        if (!pull) return send(res, 400, { error: `Provide a GitHub pull request URL from ${application.repo}.` });
        const verified = await fetchPublicPullRequest(pull, task.issueNumber);
        if (verified.error) return send(res, verified.status, { error: verified.error });
        application.prUrl = pull.url;
        application.prMerged = Boolean(verified.data.merged_at);
        application.status = 'PR submitted';
      } else if (input.status === 'Assigned') {
        if (application.status !== 'Pending') return send(res, 409, { error: 'Only pending applications can be assigned.' });
        if (db.applications.some(item => item.taskId === application.taskId && item.status === 'Assigned')) return send(res, 409, { error: 'This issue already has an assigned contributor.' });
        const org = application.repo.split('/')[0].toLowerCase();
        const assignedForOrg = db.applications.filter(item => item.waveId === application.waveId && item.applicant.toLowerCase() === application.applicant.toLowerCase() && item.repo.split('/')[0].toLowerCase() === org && ['Assigned', 'PR submitted'].includes(item.status)).length;
        if (assignedForOrg >= 4) return send(res, 409, { error: 'This contributor already has four assigned issues in this organization.' });
        application.status = 'Assigned';
        task.status = 'Assigned';
        for (const other of db.applications) {
          if (other.taskId === application.taskId && other.id !== application.id && other.status === 'Pending') other.status = 'Inactive';
        }
      } else if (input.status === 'Rejected') {
        if (application.status !== 'Pending') return send(res, 409, { error: 'Only pending applications can be rejected.' });
        application.status = 'Rejected';
      } else if (input.status === 'Completed') {
        if (!['Assigned', 'PR submitted'].includes(application.status) || !application.prUrl) return send(res, 409, { error: 'A submitted pull request is required before marking work complete.' });
        if (application.status === 'Completed') return send(res, 409, { error: 'Points were already awarded for this application.' });
        const pull = validPullRequestUrl(application.prUrl, application.repo);
        if (!pull) return send(res, 400, { error: 'The saved pull request URL is invalid.' });
        const verified = await fetchPublicPullRequest(pull, task.issueNumber);
        if (verified.error) return send(res, verified.status, { error: verified.error });
        if (!verified.data.merged_at) return send(res, 409, { error: 'The linked pull request must be merged before completion points are awarded.' });
        application.status = 'Completed';
        application.prMerged = true;
        application.pointsAwarded = task.points;
        task.status = 'Completed';
        task.completedAt = new Date().toISOString();
      } else {
        return send(res, 400, { error: 'Use PR submission or a supported review status: Assigned, Rejected, Completed.' });
      }

      application.updatedAt = new Date().toISOString();
      await saveDb(db);
      return send(res, 200, { application });
    }

    if (req.method === 'GET' && url.pathname === '/leaderboard') {
      const db = await readDb();
      const waveId = url.searchParams.get('waveId') || db.waves[0]?.id;
      const totals = new Map();
      for (const item of db.applications) {
        if (item.waveId !== waveId || item.status !== 'Completed') continue;
        const current = totals.get(item.applicant) || { applicant: item.applicant, points: 0, completedIssues: 0 };
        current.points += item.pointsAwarded || 0;
        current.completedIssues += 1;
        totals.set(item.applicant, current);
      }
      const leaderboard = [...totals.values()].sort((a, b) => b.points - a.points || a.applicant.localeCompare(b.applicant));
      return send(res, 200, { waveId, leaderboard });
    }

    return send(res, 404, { error: 'Route not found.' });
  } catch (error) {
    return send(res, error instanceof SyntaxError ? 400 : 500, {
      error: error instanceof SyntaxError ? 'Request body must be valid JSON.' : 'Unexpected server error.'
    });
  }
});

server.listen(port, () => console.log(`SoroWave API listening at http://localhost:${port}`));
