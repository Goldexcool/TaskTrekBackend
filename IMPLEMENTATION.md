# TaskTrek Backend — Implementation Summary

## What We Built

Starting from a working single-app Kanban backend, we upgraded it into a clean, containerized, multi-tenant SaaS foundation. Nothing existing was broken — all 36 tests pass.

---

## Part 1 — Dependency Cleanup & New Packages

**Added to `dependencies`:**
| Package | Why |
|---|---|
| `helmet` | Automatic security headers on every response |
| `express-rate-limit` | Rate limiting to prevent abuse |
| `slugify` | Auto-generate URL-safe org slugs |

**Added to `devDependencies`:**
| Package | Why |
|---|---|
| `jest` | Test runner |
| `supertest` | HTTP integration testing |
| `mongodb-memory-server` | In-process MongoDB — tests need no real DB |
| `@jest/globals` | Jest types |

---

## Part 2 — Environment Configuration (`src/config/default.js`)

- **Production safety:** app exits on startup if `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, or `REFRESH_TOKEN_SECRET` are missing in `NODE_ENV=production`
- **Dev fallbacks:** clear console warnings when using insecure defaults in development
- `ALLOWED_ORIGINS` now parsed from comma-separated string into an array here, used everywhere consistently
- Added `.env.example` — complete template for all required variables

---

## Part 3 — App Hardening (`src/app.js`)

Full rewrite of the Express setup:

- `helmet()` — security headers on all responses
- `express-rate-limit` — **auth routes:** 30 req/15 min, **all other routes:** 300 req/15 min
- Body size limit — `2mb` max on JSON and URL-encoded bodies
- CORS — `x-tenant-id` and `x-tenant-slug` added to `allowedHeaders` so browsers don't block them
- Config imported from `src/config/default.js` instead of duplicated inline
- `/api/tenants` route mounted

---

## Part 4 — Docker

**`Dockerfile`**
- Node 20 Alpine base image
- `npm ci --omit=dev` — production-only install
- Exposes port 3000

**`.dockerignore`**
- Excludes `node_modules`, `.env`, `.git`

**`docker-compose.yml`**
- `api` service — builds from Dockerfile, loads `.env`
- `mongo` service — MongoDB 7 with a persistent volume and health check
- API waits for Mongo to be healthy before starting
- Internal `tasktrek` network

```bash
docker compose up --build   # start everything
docker compose down         # stop and remove containers
docker compose logs -f api  # follow API logs
```

---

## Part 5 — Multi-Tenant Architecture

### Tenant Model (`src/models/Tenant.js`)

A new top-level resource representing an organization or workspace.

**Fields:**
```
name          String (required, max 100)
slug          String (unique, auto-generated, URL-safe)
description   String
logo          String
owner         ObjectId → User
members[]     { user, role, status, joinedAt, invitedAt }
settings      Mixed
status        active | suspended | deleted
createdAt / updatedAt
```

**Member roles inside a tenant:** `owner | admin | member | viewer`

**Slug generation:** automatic on save via `slugify`. Collision-safe — appends `-1`, `-2` etc. if the base slug is taken.

**Indexes:** `slug` (unique), `owner`, `members.user`, `status`, `createdAt`

---

### `tenant` Field Added to All Existing Models

Every resource that belongs to an organization now carries a `tenant` reference:

| Model | Field added |
|---|---|
| `Team` | `tenant: ObjectId → Tenant` |
| `Board` | `tenant: ObjectId → Tenant` |
| `Column` | `tenant: ObjectId → Tenant` |
| `Task` | `tenant: ObjectId → Tenant` |
| `Activity` | `tenant: ObjectId → Tenant` |
| `Notification` | `tenant: ObjectId → Tenant` |

### `currentTenant` Added to User

```js
User.currentTenant  // ObjectId → Tenant (last-switched org)
```

---

## Part 6 — Tenant Middleware (`src/middleware/tenantMiddleware.js`)

Three exported middleware functions:

### `resolveTenant`
Resolves the active tenant and attaches it to the request. Resolution order:
1. `x-tenant-id` header (ObjectId)
2. `x-tenant-slug` header (slug string)
3. `req.user.currentTenant` (stored on the user document)

Returns `400` if no tenant can be resolved. Returns `403` if the user is not an active member of the resolved tenant.

Attaches to request:
```js
req.tenant       // full Tenant document
req.tenantId     // ObjectId shorthand
req.tenantMember // { role, status }
```

### `requireTenantAdmin`
Gates a route to `owner` or `admin` roles only. Must follow `resolveTenant`.

### `requireTenantOwner`
Gates a route to `owner` only. Must follow `resolveTenant`.

---

## Part 7 — Tenant Routes & Controller

### Routes (`/api/tenants`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/tenants` | any user | Create organization |
| `GET` | `/api/tenants` | any user | List my organizations |
| `GET` | `/api/tenants/current` | + resolveTenant | Get active org from header |
| `GET` | `/api/tenants/:id` | member check | Get org by ID |
| `PATCH` | `/api/tenants/:id` | + requireTenantAdmin | Update org |
| `DELETE` | `/api/tenants/:id` | + requireTenantOwner | Soft-delete org |
| `GET` | `/api/tenants/:id/members` | + resolveTenant | List members |
| `POST` | `/api/tenants/:id/members` | + requireTenantAdmin | Add member by email or ID |
| `PATCH` | `/api/tenants/:id/members/:userId/role` | + requireTenantAdmin | Change member role |
| `DELETE` | `/api/tenants/:id/members/:userId` | + requireTenantAdmin | Remove member |
| `POST` | `/api/tenants/:id/switch` | + resolveTenant | Set as active org |

**Guards built into the controller:**
- Owner cannot be removed
- Owner's role cannot be changed
- Only owner can delete the tenant (soft-delete, sets `status: 'deleted'`)
- Duplicate members are rejected

---

## Part 8 — Tenant Isolation in Existing Controllers

All list and create operations in existing controllers now scope by tenant when `req.tenantId` is present. The pattern used everywhere:

```js
// Create — stores tenant on new documents
Task.create({ ...fields, ...(req.tenantId && { tenant: req.tenantId }) })

// Query — filters by tenant when context is available
Task.find({ assignedTo: userId, ...(req.tenantId && { tenant: req.tenantId }) })
```

**Backward compatible** — documents without a `tenant` field still work. Unscoped queries return all data for users without tenant context (existing API clients are unaffected).

Controllers updated:
- `teamController` — `createTeam`, `getTeams`
- `boardController` — `createBoard`, `getBoards`
- `taskController` — `createTask`, `getAllTasks`, `getTasksByUser`, `getTasksByColumn`
- `activityController` — `getUserActivityFeed`
- `notificationController` — `getNotifications`

---

## Part 9 — Activity Service Update (`src/services/activityService.js`)

All three log functions now accept an optional `tenantId` parameter:

```js
logTaskActivity(userId, action, taskId, boardId, columnId, metadata, tenantId)
logBoardActivity(userId, action, boardId, metadata, tenantId)
logTeamActivity(userId, action, teamId, metadata, tenantId)
```

Tenant is stored on Activity documents when provided.

---

## Part 10 — Migration Script (`scripts/migrateTenants.js`)

One-time idempotent script to backfill existing data.

For each user who owns teams without a `tenant` field:
1. Creates a default Tenant named `"<username>'s Organization"`
2. Assigns all their Teams, Boards, Columns, Tasks, Activities, and Notifications to it
3. Adds all team/board members as Tenant members
4. Sets `User.currentTenant` to the new Tenant

**Safe to run multiple times** — skips already-migrated documents.

```bash
npm run migrate:tenants
```

---

## Part 11 — Test Suite

**36 tests across 3 files — all passing.**

### Setup
- `mongodb-memory-server` — fully in-process DB, no external MongoDB needed
- `tests/env.js` — sets env vars before any module loads
- `tests/setup.js` — mocks nodemailer so no real emails are sent during tests
- `tests/helpers.js` — shared `connectDB`, `disconnectDB`, `clearCollections`, `createTestUser`, `createTestTenant`

### Test files

**`auth.test.js` (12 tests)**
- Signup: success, duplicate email/username, missing fields
- Login: valid credentials, wrong password, unknown user
- Refresh token: valid flow, invalid token
- GET /me: authenticated, unauthenticated

**`tenant.test.js` (16 tests)**
- Create: success + slug generation, duplicate name → auto-increment slug, missing name, no auth
- List: isolation between different users
- Current: resolve by `x-tenant-id`, resolve by `x-tenant-slug`, no context → 400, non-member → 403
- Update: owner succeeds, non-member blocked
- Add member: by email, duplicate rejected
- Delete: owner succeeds (soft-delete), member blocked
- Switch: sets `currentTenant` on user document

**`middleware.test.js` (8 tests)**
- `authenticateToken`: valid token, missing token, malformed token
- `resolveTenant`: by id header, by slug header, no context, non-member
- `requireTenantAdmin`: owner allowed, viewer blocked
- `requireTenantOwner`: admin (non-owner) blocked

### Two real bugs found and fixed by tests

| Bug | Fix |
|---|---|
| `signup` generated a `refreshToken` but never saved it to the User document — so `/refresh-token` always returned 403 after signup | Added `User.findByIdAndUpdate(user._id, { refreshToken })` in signup handler |
| `refreshTokenHandler` queried `{ refreshToken }` on User but the field has `select: false` — match always failed | Added `.select('+refreshToken')` to the query |

---

## New Commands

```bash
npm test                 # run all 36 tests
npm run test:watch       # watch mode
npm run migrate:tenants  # backfill existing data to tenants
docker compose up --build
docker compose down
docker compose logs -f api
```

---

## Files Added

```
.env.example
Dockerfile
.dockerignore
docker-compose.yml
src/models/Tenant.js
src/middleware/tenantMiddleware.js
src/controllers/tenantController.js
src/routes/tenantRoutes.js
scripts/migrateTenants.js
tests/env.js
tests/setup.js
tests/helpers.js
tests/auth.test.js
tests/tenant.test.js
tests/middleware.test.js
```

## Files Modified

```
package.json              — new deps + scripts + jest config
src/app.js                — helmet, rate limiting, body limit, tenant route
src/config/default.js     — env validation, production safety
src/controllers/authController.js     — signup saves refreshToken, refresh query fix
src/controllers/boardController.js    — tenant isolation
src/controllers/taskController.js     — tenant isolation
src/controllers/teamController.js     — tenant isolation
src/controllers/activityController.js — tenant isolation
src/controllers/notificationController.js — tenant isolation
src/services/activityService.js       — tenantId param on all log functions
src/models/User.js         — currentTenant field
src/models/Team.js         — tenant field
src/models/Board.js        — tenant field
src/models/Column.js       — tenant field
src/models/Task.js         — tenant field
src/models/Activity.js     — tenant field
src/models/Notification.js — tenant field
CLAUDE.md                  — updated architecture docs
```
