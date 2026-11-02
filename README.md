# SoroWave API

Node.js API for the SoroWave community-cycle preview. It stores cycles, GitHub issues, applications, assignments, PR links, and completion points in `data/db.json`.

## Run

Requires Node.js 18 or newer.

```sh
npm start
```

Run `npm install` once before starting the API.

Copy `.env.example` to `.env` if you want to set the port or published testnet contract IDs. Contract IDs may be blank while the project is being built.

The API listens on `http://localhost:4173`. Set `PORT` to change the port.

## Routes

- `GET /health` — health check
- `GET /stellar/config` — public Stellar testnet RPC/Horizon settings and optional contract IDs
- `GET /stellar/status` — bounded Horizon and Soroban RPC health checks, plus whether pool/token contract IDs are configured
- `GET /stellar/accounts/:address` — validate a public key and read its Horizon balances
- `GET /waves` and `GET /waves/:id` — read preview cycles and issue counts
- `GET /tasks?page=1&limit=20` — paginated open issue list; supports `q`, `category`, and `waveId`
- `GET /tasks?all=true` — include assigned and completed issues
- `GET /tasks/:id` — read an issue listing
- `GET /github/issue?url=...` — verify a public GitHub issue and prefill its title and body
- `POST /tasks` — add a verified open GitHub issue with category and complexity
- `GET /applications` — list applications (prototype maintainer view)
- `GET /applications?applicant=username` — list applications for a GitHub username
- `POST /applications` — apply to an issue
- `PATCH /applications/:id` — record assignment or rejection, submit a PR URL, or record completion
- `GET /leaderboard?waveId=...` — total preview points for completed contributions

Complexity maps to 100 / 150 / 200 preview points. The API limits each contributor to 15 pending applications per cycle and 4 assigned issues per organization. Accepting one applicant makes other pending applications for that issue inactive. Pull requests must exist publicly, target the same GitHub repository, and include a GitHub issue-closing keyword. Completion points are recorded only after GitHub reports the PR as merged and a maintainer records completion.

Applications may include an optional `walletAddress` alongside the GitHub username. No private keys or signing material belong in this API. GitHub issue lookups use the public REST API and follow its unauthenticated rate limits.

## Prototype limits

This server has no authentication or authorization: anyone can impersonate a GitHub username, assign work, or record completion. The maintainer controls are local preview controls only. It is not affiliated with Drips Wave and has no funded pool, real payout accounting, webhook sync, or production database. Do not expose it publicly or use it to manage real funds.
