# SoroWave API

A small Node.js API for listing open work, collecting contributor applications, and reading Stellar testnet account balances. It stores demo data in `data/db.json`.

## Run

Requires Node.js 20 or newer.

```sh
npm start
```

Copy `.env.example` to `.env` if you want to set the port or published testnet contract IDs. Contract IDs may be blank while the project is being built.

The API listens on `http://localhost:4173`. Set `PORT` to change the port.

## Routes

- `GET /health` — health check
- `GET /stellar/config` — public Stellar testnet RPC/Horizon settings and optional contract IDs
- `GET /stellar/accounts/:address` — validate a public key and read its Horizon balances
- `GET /tasks` — list tasks (`?category=contracts` is supported)
- `POST /tasks` — create a task
- `GET /applications` — list applications (prototype maintainer view)
- `POST /applications` — apply to a task

Applications may include an optional `walletAddress` alongside the GitHub username. No private keys or signing material belong in this API.

## Prototype limits

This server has no authentication, authorization, rate limiting, or production database. Do not expose it publicly or use it to manage real funds. Add those controls before using real accounts or payments.
