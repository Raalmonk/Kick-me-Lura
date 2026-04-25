# Kick-me Lu'ra (WCL Interrupt Analyzer)

Full-stack web tool for analyzing Lu'ra (Seat of the Triumvirate) interrupt assignments against Warcraft Logs V2 data.

## What it does

- Parses the 3x4 assignment block between `intstart` and `Intend`.
- Pulls the Lu'ra pulls from a report code.
- Supports:
  - **Last Pull Analysis** (`/api/analyze/last-pull`)
  - **Whole Night Analytics** (`/api/analyze/night`)
- Evaluates errors:
  - Wrong Target (interrupting Lu'ra instead of Termination Matrix)
  - Early Kick (cast with no interrupt)
  - Wrong Order
  - Unassigned Kick
  - Missed Kick
- Handles warlock pet interrupts (`Axe Toss`, spell 89766) by mapping pet actor -> owner actor.

## Project layout

- `backend/` Node.js + Express API (keeps OAuth credentials server-side)
- `frontend/` static web UI

## Backend setup

1. Copy env template:

```bash
cp backend/.env.example backend/.env
```

2. Edit `backend/.env` and set:

```env
WCL_CLIENT_ID=...
WCL_CLIENT_SECRET=...
PORT=8080
```

3. Install + run:

```bash
cd backend
npm install
npm start
```

## Frontend setup

Serve `frontend/` via any static file server, e.g.:

```bash
cd frontend
python3 -m http.server 5173
```

Open: `http://localhost:5173`

> Frontend expects backend at `http://localhost:8080/api`.

## GraphQL queries included

The backend includes concrete query templates for:
- report fights + actors
- player details/combatant info
- cast events + interrupt events

See: `backend/src/queries.js`
