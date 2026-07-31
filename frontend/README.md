# CyberSnake Frontend (Live Backend Prototype)

Real Vanilla JS / Fetch API / Socket.io client frontend that talks to the actual
Express + Socket.io backend you uploaded (`snakebyte`) — no mock/random data.

## Structure

```
frontend/
├── player.html          Player entry point (markup only)
├── admin.html            Game Master entry point (markup only)
├── css/
│   └── style.css         Shared styles for both pages
└── js/
    ├── config.js          Single source of truth for the API base URL
    ├── apiService.js       Fetch API wrapper — every backend endpoint call lives here
    ├── socketService.js    Socket.io client wrapper
    ├── boardData.js         Board layout (LADDERS/SNAKES/FLASHING_TILES) + render helpers
    ├── playerApp.js        Player screen logic (imports the above)
    └── adminApp.js          Admin screen logic (imports the above)
```

Each `.html` file is markup-only; all behavior lives in its matching `js/*App.js` module,
which pulls in the shared `apiService.js`, `socketService.js`, and `boardData.js` modules.
This mirrors the backend's own separation into `routes/` → `controllers/` → `services/`.

## Running it

1. Start the backend: `npm install && npm start` (listens on `http://localhost:3000`).
2. Serve this `frontend/` folder with any static server, e.g.:
   ```
   npx serve frontend
   ```
   (ES modules need to be loaded over `http://`, not opened directly as `file://`.)
3. Open `player.html` for the player flow, `admin.html` for the Game Master flow.
4. Use two different browsers (or one normal + one incognito window) if testing
   player and admin at the same time — see note #5 below on why.

## Known backend gaps (not frontend bugs — flagging for the team)

Verified live, against this exact set of backend files, on 31 Jul 2026:

1. **Admin-created rooms can't be started — hard blocker, no frontend workaround possible.**
   `adminController.js`'s `adminCreateRoom()` sets `req.session.playerId` but never
   `req.session.sessionId`. `gameController.js`'s `start()` requires both to be set,
   so calling Start on an admin-created room always returns
   `{"code":2004,"msg":"Player not in a session"}`. There is no request field the
   frontend can send to substitute for this — it's purely server-side session state.
   **Fix:** add one line next to the existing one in `adminCreateRoom`:
   ```js
   req.session.playerId = adminPlayerId;
   req.session.sessionId = sessionId;   // ← missing
   ```
   Player-created rooms (via `/api/game/create`) are unaffected and start correctly.

2. **Using any item (rocket or bomb) currently always fails with a 500 error.**
   `gameController.js`'s `useItem()` calls `getItemSteps(itemType, session.presets)`
   without the `gameLogic.` prefix, even though it's imported as
   `const gameLogic = require('../services/gameLogic')`. This throws
   `ReferenceError: getItemSteps is not defined` on every item use, confirmed live.
   **Fix:** change that one call to `gameLogic.getItemSteps(itemType, session.presets)`.

3. **`/api/bonus/answer` will crash if ever reached.** `bonusController.js` calls
   `gameLogic.getBonusReward()`, but `gameLogic.js` only exports `getBonusSteps`,
   not `getBonusReward`. Not currently triggerable from the frontend (see #4), so
   this hasn't been hit live, but will need fixing before bonus rounds work.

4. **Sockets never join a session room**, and **`/api/bonus/*` isn't wired into
   the UI** — same as previously noted; no bonus-round UI exists yet since there's
   no way for a player to know one has started.

5. **Granted items aren't persisted into `player.inventory`.** `move()` computes
   and returns `itemGranted` but never pushes it into the database. Confirmed still
   present in this version (`inventory: []` is hardcoded in every response).

Fixed since the last round (no longer issues): CORS now correctly uses
`origin: true` instead of `'*'` in both the Express and Socket.io configs, and
`middleware/errorHandler.js` now exists.

**Backend port has changed:** this version runs on `http://localhost:5000`
(previously `3000`) — `player.html`, `admin.html`, and `config.js` have all been
updated to that new default.
