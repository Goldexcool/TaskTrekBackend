# TaskTrek Frontend Implementation Guide for Codex

## Purpose

This document explains how to build the TaskTrek frontend against this backend API using Codex as your implementation partner.

Use this alongside [FRONTEND_HANDOFF.md](/Users/a1234/TaskTrekBackend/FRONTEND_HANDOFF.md), which is the API-facing contract. This guide is the frontend execution plan.

## What the frontend needs to support

The backend provides a multi-tenant task management platform with these product areas:

- Authentication
- Workspace or organization switching via tenants
- User profile management
- Teams and team membership
- Boards and board membership
- Columns
- Tasks
- Notifications
- Activity feeds
- Platform admin screens
- Real-time room subscription with Socket.IO

At a UX level, the frontend should feel like a workspace product similar to Linear, Trello, or Jira Lite:

- A user signs in
- Picks or creates a workspace
- Creates teams inside that workspace
- Creates boards inside a team
- Uses columns and tasks to manage work
- Sees notifications and activity
- Switches workspaces without signing out

## Recommended frontend stack

If you are starting fresh, use this stack with Codex:

- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS
- React Query for server state
- Zustand for auth/session UI state
- Zod for API validation where helpful
- Socket.IO client

If you already have a frontend, keep your existing stack and map the same concepts into it.

## Core frontend architecture

Organize the app by feature, not by file type only.

Suggested structure:

```text
src/
  app/
    (auth)/
      login/
      signup/
      forgot-password/
      reset-password/[token]/
    (dashboard)/
      layout.tsx
      page.tsx
      workspaces/
      teams/
      boards/
      tasks/
      notifications/
      settings/
      admin/
  components/
    ui/
    auth/
    workspace/
    boards/
    tasks/
    teams/
  features/
    auth/
      api.ts
      hooks.ts
      store.ts
      types.ts
    tenants/
    users/
    teams/
    boards/
    columns/
    tasks/
    notifications/
    activities/
    admin/
  lib/
    api-client.ts
    socket.ts
    env.ts
    utils.ts
  providers/
    query-provider.tsx
    auth-provider.tsx
    tenant-provider.tsx
```

## State model

Split state into three categories:

- Persistent auth state: `accessToken`, `refreshToken`, current user
- Persistent workspace state: `currentTenantId`, `currentTenantSlug`, tenant list
- Server state: boards, tasks, teams, notifications, activities

Recommended ownership:

- Zustand: auth session, selected tenant, lightweight UI state
- React Query: all API-backed entities
- Local component state: dialogs, filters, form drafts

## API client requirements

Build a single shared API client. Every feature should use it.

The client must:

- Attach `Authorization: Bearer <accessToken>` on protected requests
- Attach `x-tenant-id` when a tenant is selected
- Retry once after refreshing the token on `401`
- Clear session and redirect to login if refresh fails

Minimal behavior:

```ts
1. Send request with access token
2. If response is 401, call POST /api/auth/refresh-token with refreshToken
3. Save returned tokens
4. Retry original request once
5. If refresh fails, sign the user out
```

Important backend detail:

- Tenant-scoped behavior is driven by `x-tenant-id` or `x-tenant-slug`
- Prefer `x-tenant-id`
- Store `currentTenantId` immediately after workspace creation or switch

## Required screens

Build these screens first:

### 1. Auth

- Login
- Signup
- Forgot password
- Reset password

### 2. Workspace onboarding

- Create workspace
- List my workspaces
- Switch workspace
- Workspace members
- Invite member
- Change member role

### 3. Main product

- Dashboard overview
- Teams list
- Team details
- Boards list
- Board details with columns and tasks
- Task creation and editing
- Notifications center
- Activity feed
- User profile

### 4. Admin

- Platform stats
- User list and detail
- Tenant list and detail
- Tenant status update

Only show admin routes when `user.role === "admin"`.

## Route and feature mapping

Use this backend-to-frontend mapping:

| Frontend area | Backend routes |
|---|---|
| Auth | `/api/auth/*` |
| Profile | `/api/users/profile`, `/api/users/:id`, `/api/users/search` |
| Workspaces | `/api/tenants/*` |
| Teams | `/api/teams/*` |
| Boards | `/api/boards/*` |
| Columns | `/api/columns/*` and board column routes |
| Tasks | `/api/tasks/*` |
| Notifications | `/api/notifications/*` |
| Activities | `/api/activities/*` |
| Admin | `/api/admin/*` |

## Backend quirks the frontend should respect

These are based on the code in this repo, not just the handoff doc:

- `GET /api/users/search` expects `query`, not `q`
- `PUT /api/users/profile` is the real update route
- `PUT /api/teams/:id` is the real team update route
- `PATCH /api/notifications/read` expects `{ notificationIds, all }`
- `POST /api/tasks` expects at least `title` and `columnId`
- Workspace-aware requests should always include `x-tenant-id`

Treat these as source-of-truth behaviors unless the backend changes.

## Suggested user flow

Implement the happy path in this order:

### Phase 1

- Signup
- Login
- Session persistence
- Logout
- Protected routes

### Phase 2

- Create tenant
- List tenants
- Switch tenant
- Persist current tenant
- Inject tenant header into API client

### Phase 3

- Teams CRUD
- Board CRUD
- Columns CRUD
- Task CRUD
- Task assignment and move flow

### Phase 4

- Notifications UI
- Activity feed UI
- Profile editing
- Admin pages
- Socket.IO integration

## Recommended React Query keys

Use stable keys like:

```ts
["me"]
["tenants"]
["tenant", tenantId]
["tenant-members", tenantId]
["teams", tenantId]
["team", teamId]
["boards", tenantId]
["board", boardId]
["board-columns", boardId]
["tasks", tenantId]
["tasks", "column", columnId]
["tasks", "user", userId]
["notifications", tenantId, page, unreadOnly]
["activities", tenantId]
```

Invalidate conservatively after mutations:

- creating a task: invalidate board, column tasks, task lists
- switching tenant: invalidate nearly all tenant-scoped queries
- adding members: invalidate tenant or team member queries

## Socket.IO integration

After login and after loading user plus current tenant context:

- connect socket once
- join `user:<userId>`
- join team room on team pages
- join board room on board pages

Basic setup:

```ts
socket.emit("join:user", userId)
socket.emit("join:team", teamId)
socket.emit("join:board", boardId)
```

Even if the backend is not yet emitting rich live events, build the client wrapper now so the app is ready.

## UX rules Codex should follow

Tell Codex to build with these behaviors:

- Redirect unauthenticated users to login
- Do not render dashboard pages until auth and tenant resolution complete
- Show an explicit workspace picker if the user belongs to multiple tenants
- If the user has no tenant, redirect to create-workspace flow
- Keep forms optimistic only where safe
- Use server-confirmed updates for destructive actions
- Surface backend error messages directly when helpful

## Copy-paste prompts for Codex

Use prompts like these in your frontend repo.

### Prompt 1: app shell

```text
Build the initial TaskTrek frontend app shell in Next.js App Router with TypeScript, Tailwind, React Query, Zustand, and Socket.IO client.

Requirements:
- Create auth pages for login, signup, forgot-password, and reset-password
- Create a protected dashboard layout
- Add a shared API client with bearer token auth, refresh-token retry, and x-tenant-id header support
- Add Zustand stores for auth session and current tenant
- Add React Query provider
- Use feature-based folders
- Keep the code production-quality and strongly typed
```

### Prompt 2: tenant flow

```text
Implement the tenant workspace flow for TaskTrek.

Requirements:
- Create pages to list, create, and switch workspaces
- Use /api/tenants endpoints
- Persist currentTenantId in client state
- Inject x-tenant-id into all tenant-scoped API requests
- If the user has no tenant, redirect them into workspace creation
- Add member management UI for workspace members and role updates
```

### Prompt 3: boards and tasks

```text
Implement the TaskTrek board experience.

Requirements:
- Build board list and board detail pages
- On board detail, render columns and tasks in a Kanban layout
- Support create, edit, delete, move, assign, complete, and reopen task flows
- Use React Query for all server state
- Use the backend routes from the API handoff
- Keep the UI responsive for desktop and mobile
```

### Prompt 4: notifications and activities

```text
Implement notifications and activity feeds for TaskTrek.

Requirements:
- Notifications page with pagination and unread filter
- Mark selected notifications as read using PATCH /api/notifications/read with { notificationIds, all }
- Activity feed pages for current user, team, board, and task
- Add a header notification badge
```

### Prompt 5: admin area

```text
Implement a platform admin area for TaskTrek.

Requirements:
- Only show admin routes when the authenticated user's role is admin
- Build pages for platform stats, users, user detail, tenants, and tenant detail
- Support updating user roles and tenant statuses
- Reuse the shared API client and query patterns
```

## Acceptance checklist

The frontend is in good shape when all of this works:

- A new user can sign up and log in
- The session survives refresh
- A user can create a workspace
- Switching workspace changes tenant-scoped data
- A user can create a team, board, column, and task
- Tasks can be assigned and moved
- Notifications load and can be marked read
- Activity feeds render correctly
- Admin-only routes are hidden from normal users
- API errors are handled cleanly
- The app works on mobile and desktop

## Final implementation advice

Do not ask Codex to build the entire product in one prompt. Use phased prompts and review each phase before moving on.

The best sequence is:

1. App shell and auth
2. Tenant flow
3. Teams and boards
4. Tasks and Kanban interactions
5. Notifications and activities
6. Admin
7. Polish and real-time support

If you want, the next step I can take is writing a second doc with exact frontend types, API function signatures, and React Query hooks for every endpoint.
