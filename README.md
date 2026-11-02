# SoroWave API

A small Node.js API for listing open work and collecting contributor applications. It uses only Node's built-in modules and stores demo data in `data/db.json`.

## Run

Requires Node.js 20 or newer.

```sh
npm start
```

The API listens on `http://localhost:4173`. Set `PORT` to change the port.

## Routes

- `GET /health` — health check
- `GET /tasks` — list tasks (`?category=contracts` is supported)
- `POST /tasks` — create a task
- `GET /applications` — list applications (prototype maintainer view)
- `POST /applications` — apply to a task

## Prototype limits

This server has no authentication, authorization, rate limiting, or production database. Do not expose it publicly or use it to manage real funds. Add those controls before using real accounts or payments.
