# SoroWave API

Node.js API for the SoroWave community-cycle preview. It stores cycles, GitHub issues, applications, assignments, PR links, and completion points in `data/db.json`.

## Run

Requires Node.js 22.12 or newer.

```sh
npm start
```

Run `npm install` once before starting the API.

Copy `.env.example` to `.env` to set the port, published testnet contract IDs, and a private maintainer token. Generate a token with `openssl rand -hex 32`. Never commit the resulting `.env` or expose the token as a `VITE_` frontend variable. Maintainer actions return `503` until the token is configured.

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
- `POST /tasks` — add a verified open GitHub issue with category and complexity; requires `Authorization: Bearer <SOROWAVE_MAINTAINER_TOKEN>`
- `GET /applications` — list full application records; requires the maintainer token
- `GET /applications?applicant=username` — list a redacted status view for a GitHub username
- `POST /applications` — apply to an issue
- `PATCH /applications/:id` — submit a PR URL; assignment, rejection, and completion require the maintainer token
- `GET /leaderboard?waveId=...` — total preview points for completed contributions

Complexity maps to 100 / 150 / 200 preview points. The API limits each contributor to 15 pending applications per cycle and 4 assigned issues per organization. Accepting one applicant makes other pending applications for that issue inactive. Pull requests must exist publicly, target the same GitHub repository, and include a GitHub issue-closing keyword. Completion points are recorded only after GitHub reports the PR as merged and a maintainer records completion.

Application status changes (assignment, rejection, and completion) require the maintainer token. Contributor PR submissions do not. Public applicant lookups omit application messages, wallet addresses, and award transaction hashes. The app prompts maintainers for the token and keeps it only in the current browser tab. Applications may include an optional `walletAddress` alongside the GitHub username. No private keys or signing material belong in this API. GitHub issue lookups use the public REST API and follow its unauthenticated rate limits.

## Prototype limits

This is still a preview service. GitHub usernames are not authenticated, and a public username lookup can reveal that the user applied and the application status. Before completing an application, the API checks Stellar Testnet for a successful transaction containing the configured pool's matching application ID, contributor wallet, wave ID, and point amount. The contract is unaudited. The API stores records in a local JSON file; use a host with durable storage and backups before public use. It has no webhook sync or production database. Do not use real funds.
