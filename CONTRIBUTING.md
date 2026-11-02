# Contributing to SoroWave API

SoroWave is an independent community preview. Listing an issue here does not enroll it in Drips Wave or reserve a reward.

## Workflow

1. Read the linked GitHub issue and acceptance criteria.
2. Apply through the preview and wait for the repository maintainer to assign the GitHub issue before starting work.
3. Keep the change focused and open a pull request that references the issue with `Closes #<number>`.
4. Describe API changes, compatibility effects, and how you verified the behavior.

## Local checks

Use Node.js 18 or newer, run `npm ci`, then `node --check src/server.js`. The JSON store and unauthenticated maintainer routes are for local preview only.
