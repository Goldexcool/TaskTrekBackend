# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # development with hot-reload (nodemon)
npm start                # production
npm run migrate:tenants  # one-time migration — assigns existing data to default tenants
```

Docker:
```bash
docker compose up --build   # build and start API + MongoDB
docker compose down
docker compose logs -f api
```

No test runner or linter is configured.

## Architecture

**TaskTrekBackend** is an Express.js + MongoDB + Socket.IO multi-tenant SaaS backend for a Kanban task management platform. Entry point: `src/server.js` (HTTP + Socket.IO); Express app config and route mounting: `src/app.js`.

### Data hierarchy

```
Tenant (organization/workspace)
  └── Team
        └── Board
              └── Column
                    └── Task
Activity and Notification are also tenant-scoped.
```

### Request lifecycle

```
Request
  → helmet (security headers)
  → CORS (allowed origins from ALLOWED_ORIGINS env)
  → rate limiter (auth: 30/15min, general: 300/15min)
  → body parser (2 MB limit)
  → authenticateToken() [JWT]
  → [optional] resolveTenant() [x-tenant-id / x-tenant-slug header]
  → Route → Controller → Model
  → errorHandler
```

### Layer responsibilities

| Layer | Path | Role |
|---|---|---|
| Routes | `src/routes/` | Maps HTTP verbs/paths to controllers |
| Controllers | `src/controllers/` | Request/response, orchestrates models |
| Models | `src/models/` | Mongoose schemas + indexes |
| Services | `src/services/` | Shared logic — user ops, activity logging |
| Middleware | `src/middleware/` | Auth, tenant resolution, error handling |
| Utils | `src/utils/` | JWT generation, email (Nodemailer/Gmail) |
| Scripts | `scripts/` | One-time admin/migration scripts |

---

## Multi-Tenancy

### Tenant model (`src/models/Tenant.js`)

Fields: `name`, `slug` (auto-generated, unique), `description`, `logo`, `owner`, `members[]`, `settings`, `status`.

Member roles inside a tenant: `owner | admin | member | viewer`.

### Tenant context middleware (`src/middleware/tenantMiddleware.js`)

Exported functions:
- `resolveTenant` — resolves tenant from request, attaches `req.tenant`, `req.tenantId`, `req.tenantMember`
- `requireTenantAdmin` — gate for admin/owner only routes
- `requireTenantOwner` — gate for owner-only routes (delete tenant, etc.)

**Resolution order:**
1. `x-tenant-id` header (ObjectId)
2. `x-tenant-slug` header (slug string)
3. `req.user.currentTenant` (last-switched tenant stored on the user document)

Routes that require tenant context must apply `resolveTenant` after `authenticateToken`. Auth routes (`/api/auth`) do NOT use tenant context.

### Tenant scoping in controllers

All list/create queries in Team, Board, Task, Activity, and Notification controllers check `req.tenantId` and include `tenant: req.tenantId` in filters and creates when present. When no tenant context is provided (e.g. legacy calls), queries are unscoped — existing data still works.

### New tenant routes (`/api/tenants`)

| Method | Path | Auth |
|---|---|---|
| POST | `/api/tenants` | any logged-in user |
| GET | `/api/tenants` | any logged-in user |
| GET | `/api/tenants/current` | + resolveTenant |
| GET | `/api/tenants/:id` | member check in controller |
| PATCH | `/api/tenants/:id` | + resolveTenant + requireTenantAdmin |
| DELETE | `/api/tenants/:id` | + resolveTenant + requireTenantOwner |
| GET | `/api/tenants/:id/members` | + resolveTenant |
| POST | `/api/tenants/:id/members` | + resolveTenant + requireTenantAdmin |
| PATCH | `/api/tenants/:id/members/:userId/role` | + resolveTenant + requireTenantAdmin |
| DELETE | `/api/tenants/:id/members/:userId` | + resolveTenant + requireTenantAdmin |
| POST | `/api/tenants/:id/switch` | + resolveTenant |

---

## Authentication

Dual-token JWT pattern:
- **Access token** — 24h, `Authorization: Bearer <token>`, signed with `JWT_SECRET`
- **Refresh token** — 7d, signed with `REFRESH_TOKEN_SECRET`

`src/middleware/authMiddleware.js` exports `authenticateToken()` and `isAdmin()`.

In production, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, and `JWT_SECRET` **must** be set explicitly — no fallbacks (enforced in `src/config/default.js`).

---

## Implemented Features (all routes)

### Auth — `/api/auth`
| Method | Path | Description |
|---|---|---|
| POST | `/signup` | Register, sends welcome email |
| POST | `/login` | Authenticate, returns tokens |
| POST | `/refresh-token` | Exchange refresh token |
| POST | `/logout` | Invalidate refresh token |
| POST | `/forgot-password` | Send reset email (token TTL: 15 min) |
| POST | `/reset-password/:token` | Reset password |
| GET | `/me` | Current authenticated user |

### Users — `/api/users`
| Method | Path | Description |
|---|---|---|
| GET | `/profile` | Get current user's profile |
| PUT | `/profile` | Update profile (name, username, bio, avatar, jobTitle, location, website, social) |
| GET | `/:id` | Get user by ID |

Profile data is in a nested `userData` object: `{ bio, avatar, jobTitle, location, website, social: { twitter, facebook, instagram, linkedin, github } }`.

### Teams — `/api/teams`
| Method | Path | Description |
|---|---|---|
| POST | `/` | Create team |
| GET | `/` | Get current user's teams |
| GET | `/search` | Search teams by name/description |
| GET | `/exists/:teamId` | Check team exists |
| GET | `/me` | All teams for current user |
| GET | `/:id` | Team by ID |
| PUT | `/:id` | Update team |
| DELETE | `/:id` | Delete team |
| GET | `/:id/members` | List members |
| POST | `/:id/members` | Add member(s) by email or ID (bulk) |
| DELETE | `/:id/members/:userId` | Remove member |

Team member roles: `admin | member | viewer` (default: `viewer`).

### Boards — `/api/boards`
| Method | Path | Description |
|---|---|---|
| GET | `/` | All boards for user |
| POST | `/` | Create board (auto-creates To Do / In Progress / Done columns) |
| GET | `/complete` | Boards with nested columns + tasks |
| GET | `/team/:teamId` | Boards for a team |
| GET | `/:id` | Board by ID (includes columns) |
| PATCH | `/:id` | Update board |
| DELETE | `/:id` | Delete board + columns |
| POST | `/:id/members` | Add board member(s) by email or ID (bulk) |
| DELETE | `/:id/members/:userId` | Remove board member |
| PATCH | `/:id/members/:userId/role` | Update board member role |
| POST | `/:id/columns` | Create column |
| PATCH | `/:id/columns/:colId` | Update column |
| DELETE | `/:id/columns/:colId` | Delete column |
| POST | `/:id/share` | Share board with multiple users by email |

### Columns — `/api/columns`
| Method | Path | Description |
|---|---|---|
| POST | `/` | Create column |
| GET | `/board/:boardId` | Get columns for board |
| PUT | `/:id` | Update column |
| DELETE | `/:id` | Delete column (cascades task deletion) |

### Tasks — `/api/tasks`
| Method | Path | Description |
|---|---|---|
| GET | `/all` | All tasks |
| GET | `/column/:columnId` | Tasks in a column |
| GET | `/user/:userId` | Tasks assigned to user |
| POST | `/` | Create task |
| GET | `/:id` | Task by ID |
| PATCH | `/:id` | Update task |
| PATCH | `/:id/move` | Move task to column / reorder |
| PATCH | `/:id/complete` | Mark complete (records completedBy + completedAt) |
| PATCH | `/:id/reopen` | Reopen (optional `reason` in body) |
| PATCH | `/:id/assign` | Assign — lookup by ID, name, username, or email |
| PATCH | `/:id/unassign` | Unassign |
| DELETE | `/:id` | Delete task |

Task fields: `title`, `description`, `priority` (`low|medium|high|critical`), `status` (`todo|in_progress|done`), `dueDate`, `order`, `board`, `column`, `team`, `tenant`, `assignedTo`, `createdBy`, `completedBy`, `completedAt`.

### Activities — `/api/activities`
| Method | Path | Description |
|---|---|---|
| GET | `/` | Activity feed (paginated: `?page=&limit=`) |
| GET | `/feed` | Alias |

Tracked action types: `created_task`, `updated_task`, `moved_task`, `deleted_task`, `created_board`, `updated_board`, `deleted_board`, `created_team`, `updated_team`, `deleted_team`, `added_member`, `removed_member`, `changed_role`.

### Notifications — `/api/notifications`
| Method | Path | Description |
|---|---|---|
| GET | `/` | Notifications (paginated, supports `?unreadOnly=true`) |
| PATCH | `/read` | Mark as read (all or specific IDs) |
| DELETE | `/:id` | Delete notification |

Notification types: `team_invitation`, `team_invitation_accepted`, `task_assigned`, `task_completed`, `task_reopened`, `task_comment`, `board_created`, `board_shared`, `task_due_soon`, `mention`.

---

## Not Yet Implemented

Planned features with no backend routes yet:
- Task comments (`task_comment` notification type exists)
- Labels/tags on tasks
- `@mention` parsing (`mention` notification type exists)
- `task_due_soon` scheduled job
- Calendar/scheduling endpoints
- `searchUsers`, `changeRole`, `transferOwnership` (controller functions not mounted on routes)

---

## Real-time (Socket.IO)

`src/server.js` attaches Socket.IO. Room namespaces:
- `user:<userId>` — personal notifications
- `board:<boardId>` — board collaboration
- `team:<teamId>` — team events

Tenant room `tenant:<tenantId>` should be added when emitting cross-tenant-safe events. Column operations emit `column:created`, `column:updated`, `column:deleted`.

---

## Environment Variables

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=
JWT_SECRET=               # required in production
ACCESS_TOKEN_SECRET=      # required in production
REFRESH_TOKEN_SECRET=     # required in production
EMAIL_USER=               # Gmail address
EMAIL_PASS=               # Gmail App Password
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000   # comma-separated
API_BASE_URL=http://localhost:3000
```

See `.env.example` for a complete template.

## API Documentation

Swagger UI: `/api-docs` (available when the server is running).

## Migration

Run once after deployment to assign all existing teams, boards, columns, tasks, activities, and notifications to a default tenant per user:

```bash
npm run migrate:tenants
```

The script is idempotent — safe to run multiple times.
