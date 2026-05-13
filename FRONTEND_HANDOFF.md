# TaskTrek Backend — Frontend Handoff

## Overview

This backend powers a multi-tenant task management product.

Frontend language:

- call a tenant a `workspace`

Backend language:

- the model is still `Tenant`
- most workspace APIs live under `/api/tenants`

The most important flow change is that signup now supports atomic user + workspace creation in one request.

## Base URL

| Environment | URL |
|---|---|
| Local | `http://localhost:3000` |
| Production | confirm with backend before shipping |

All routes are prefixed with `/api`.

## Auth model

The API uses two tokens:

| Token | Used for | Lifespan |
|---|---|---|
| `accessToken` | `Authorization: Bearer <token>` | 24h |
| `refreshToken` | `POST /api/auth/refresh-token` body | 7d |

Recommended frontend storage:

- `accessToken`: memory or session storage
- `refreshToken`: secure storage strategy chosen by frontend

Refresh flow:

1. request fails with `401` or `403`
2. call `POST /api/auth/refresh-token`
3. replace both tokens with returned values
4. retry original request once
5. if refresh fails, sign the user out

## Workspace context

Most workspace-aware routes can use either:

- `x-tenant-id`
- `x-tenant-slug`

Frontend should prefer:

```http
x-tenant-id: <currentTenantId>
```

If a route passes through `resolveTenant`, the backend will:

- use `x-tenant-id` first
- then `x-tenant-slug`
- then `req.user.currentTenant`

Frontend should still send the tenant header explicitly on all workspace-scoped requests.

## Recommended onboarding flow

Preferred flow now:

1. `POST /api/auth/signup` with workspace payload
2. store `accessToken`, `refreshToken`, `currentTenantId`
3. treat returned `workspace` as the active workspace
4. include `x-tenant-id` on all workspace-scoped requests

Fallback flow if using legacy signup:

1. signup user
2. create workspace with `POST /api/tenants`
3. switch workspace with `POST /api/tenants/:tenantId/switch`

## Auth endpoints

### POST `/api/auth/signup`

Creates a user. It can also create the first workspace in the same request.

Minimum legacy body:

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "Password123!",
  "name": "John Doe"
}
```

Preferred new body:

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "Password123!",
  "name": "John Doe",
  "setupType": "team",
  "workspace": {
    "name": "Acme Product",
    "description": "Main team workspace"
  },
  "teamSize": "11-50",
  "jobTitle": "Product Manager"
}
```

Rules:

- `username`, `email`, and `password` are required
- `setupType` must be `personal` or `team` if provided
- if `setupType` or `workspace` is provided, `workspace.name` is required
- if `workspace` is sent without `setupType`, backend treats it as `personal`
- signup rolls back on workspace creation failure, so frontend should not expect orphaned users from this path

Response when workspace is created:

```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "664...",
    "username": "johndoe",
    "email": "john@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "workspace": {
    "_id": "665...",
    "name": "Acme Product",
    "slug": "acme-product",
    "description": "Main team workspace",
    "owner": "664...",
    "members": [
      {
        "user": "664...",
        "role": "owner",
        "status": "active"
      }
    ],
    "settings": {
      "onboarding": {
        "setupType": "team",
        "teamSize": "11-50",
        "jobTitle": "Product Manager"
      }
    },
    "status": "active"
  },
  "tenant": {
    "_id": "665..."
  },
  "currentTenantId": "665..."
}
```

Response when using the old user-only signup shape:

```json
{
  "success": true,
  "user": {
    "id": "664...",
    "username": "johndoe",
    "email": "john@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "workspace": null,
  "tenant": null,
  "currentTenantId": null
}
```

Frontend guidance:

- use `workspace` as the primary field
- `tenant` is returned for backend naming continuity
- store `currentTenantId` immediately if present

### POST `/api/auth/login`

Body:

```json
{
  "email": "john@example.com",
  "password": "Password123!"
}
```

Response:

```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "664...",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

### POST `/api/auth/refresh-token`

Body:

```json
{
  "refreshToken": "eyJ..."
}
```

Response:

```json
{
  "success": true,
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

### POST `/api/auth/logout`

Auth required.

Body:

```json
{
  "refreshToken": "eyJ..."
}
```

### GET `/api/auth/me`

Auth required.

Response shape:

```json
{
  "success": true,
  "data": {
    "id": "664...",
    "username": "johndoe",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "user",
    "currentTenant": "665...",
    "tenants": [],
    "teams": [],
    "createdAt": "2026-05-13T00:00:00.000Z",
    "updatedAt": "2026-05-13T00:00:00.000Z"
  }
}
```

Use this on app bootstrap to recover user session state.

### POST `/api/auth/forgot-password`

Body:

```json
{
  "email": "john@example.com"
}
```

### POST `/api/auth/reset-password/:token`

Body:

```json
{
  "password": "NewPassword123!"
}
```

## Workspace endpoints — `/api/tenants`

Frontend should present these as workspaces.

### Roles

| Role | Meaning |
|---|---|
| `owner` | full control |
| `admin` | manage members and update workspace |
| `member` | standard access |
| `viewer` | read-only style access |

### POST `/api/tenants`

Auth required.

Body:

```json
{
  "name": "Acme Corp",
  "description": "Optional description"
}
```

Response:

```json
{
  "success": true,
  "message": "Organization created.",
  "data": {
    "_id": "665...",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "owner": "664...",
    "members": [
      {
        "user": "664...",
        "role": "owner",
        "status": "active"
      }
    ],
    "status": "active"
  }
}
```

This also sets the caller's `currentTenant`.

### GET `/api/tenants`

Auth required.

Returns the active memberships for the current user.

### GET `/api/tenants/current`

Auth required plus tenant context.

Use this when the frontend needs to validate or hydrate the selected workspace.

### GET `/api/tenants/:tenantId`

Auth required.

User must belong to the workspace.

### PATCH `/api/tenants/:tenantId`

Auth required plus tenant context.

Requires `admin` or `owner`.

Body can include:

```json
{
  "name": "New name",
  "description": "Updated description",
  "logo": "https://...",
  "settings": {}
}
```

### DELETE `/api/tenants/:tenantId`

Auth required plus tenant context.

Requires `owner`.

Soft delete only.

### GET `/api/tenants/:tenantId/members`

Auth required plus tenant context.

Returns populated member rows.

### POST `/api/tenants/:tenantId/members`

Auth required plus tenant context.

Requires `admin` or `owner`.

Supported bodies:

```json
{
  "email": "jane@example.com",
  "role": "member"
}
```

or

```json
{
  "userId": "664...",
  "role": "admin"
}
```

Valid roles:

- `admin`
- `member`
- `viewer`

### PATCH `/api/tenants/:tenantId/members/:userId/role`

Auth required plus tenant context.

Requires `admin` or `owner`.

Body:

```json
{
  "role": "admin"
}
```

### DELETE `/api/tenants/:tenantId/members/:userId`

Auth required plus tenant context.

Requires `admin` or `owner`.

### POST `/api/tenants/:tenantId/switch`

Auth required plus tenant context.

Sets this workspace as the user's `currentTenant`.

Frontend should call this when the user changes workspace from the UI.

## User endpoints — `/api/users`

All require auth.

### GET `/api/users/profile`

Fetch current user's profile.

### PUT `/api/users/profile`

Important:

- this route is `PUT`, not `PATCH`

### GET `/api/users/search`

Important:

- the backend expects `query`
- not `q`

Example:

```http
GET /api/users/search?query=jane
```

### GET `/api/users/:id`

Fetch a single user.

## Team endpoints — `/api/teams`

All require auth unless noted.

### GET `/api/teams`

List teams for the current user.

### POST `/api/teams`

Create a team.

### GET `/api/teams/me`

Get teams the current user belongs to.

### GET `/api/teams/search`

Search teams.

### GET `/api/teams/exists/:teamId`

Public existence check.

### GET `/api/teams/:id`

Get one team.

### PUT `/api/teams/:id`

Important:

- this route is `PUT`, not `PATCH`

### DELETE `/api/teams/:id`

Delete a team.

### GET `/api/teams/:id/members`

List members.

### POST `/api/teams/:id/members`

Add a member.

### DELETE `/api/teams/:id/members/:userId`

Remove a member.

## Board endpoints — `/api/boards`

All require auth.

### GET `/api/boards`

List accessible boards.

### POST `/api/boards`

Create board.

Typical body:

```json
{
  "title": "Sprint Board",
  "description": "Optional",
  "teamId": "664..."
}
```

### GET `/api/boards/complete`

Fetch boards with nested data.

### GET `/api/boards/team/:teamId`

List boards for one team.

### GET `/api/boards/:id`

Fetch board detail.

### PATCH `/api/boards/:id`

Update board.

### DELETE `/api/boards/:id`

Delete board.

### Board member and column routes

- `POST /api/boards/:id/members`
- `DELETE /api/boards/:id/members/:userId`
- `PATCH /api/boards/:id/members/:userId/role`
- `POST /api/boards/:id/columns`
- `PATCH /api/boards/:boardId/columns/:columnId`
- `DELETE /api/boards/:boardId/columns/:columnId`
- `POST /api/boards/:id/share`

## Column endpoints — `/api/columns`

All require auth.

- `POST /api/columns`
- `GET /api/columns/board/:boardId`
- `PUT /api/columns/:id`
- `DELETE /api/columns/:id`

## Task endpoints — `/api/tasks`

All require auth.

- `GET /api/tasks/all`
- `GET /api/tasks/column/:columnId`
- `GET /api/tasks/user/:userId`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `PATCH /api/tasks/:id/move`
- `PATCH /api/tasks/:id/complete`
- `PATCH /api/tasks/:id/reopen`
- `PATCH /api/tasks/:id/assign`
- `PATCH /api/tasks/:id/unassign`
- `DELETE /api/tasks/:id`

Important task create note:

- the generic create route expects `title` and `columnId`

## Activity endpoints — `/api/activities`

All require auth.

- `GET /api/activities`
- `GET /api/activities/feed`
- `GET /api/activities/personal`
- `POST /api/activities/generate`
- `GET /api/activities/team/:teamId`
- `GET /api/activities/board/:boardId`
- `GET /api/activities/task/:taskId`
- `GET /api/activities/user/:userId`

## Notification endpoints — `/api/notifications`

All require auth.

### GET `/api/notifications`

Supports:

- `page`
- `limit`
- `unreadOnly=true`

### PATCH `/api/notifications/read`

Important request shape:

```json
{
  "notificationIds": ["1", "2"]
}
```

or

```json
{
  "all": true
}
```

Do not send `ids`; the backend expects `notificationIds`.

### DELETE `/api/notifications/:id`

Delete one notification.

## Admin endpoints — `/api/admin`

All require:

- auth
- platform-level `admin` role on the user

Routes:

- `GET /api/admin/stats`
- `GET /api/admin/users`
- `GET /api/admin/users/:userId`
- `PATCH /api/admin/users/:userId/role`
- `DELETE /api/admin/users/:userId`
- `GET /api/admin/tenants`
- `GET /api/admin/tenants/:tenantId`
- `PATCH /api/admin/tenants/:tenantId/status`

## Socket.IO

Connect to the backend base URL, then join rooms as needed:

```js
socket.emit('join:user', userId)
socket.emit('join:board', boardId)
socket.emit('join:team', teamId)
```

Use:

- `join:user` after login
- `join:board` on board detail pages
- `join:team` on team-level pages when relevant

## Frontend implementation rules

- treat `workspace` and `tenant` as the same object
- prefer `workspace` in frontend code
- store `currentTenantId` after signup or workspace switch
- always attach `x-tenant-id` when a workspace is selected
- bootstrap the app with `GET /api/auth/me`
- if `currentTenant` is null and the user has no workspace, route to workspace creation
- if signup returns `workspace: null`, use the fallback create-workspace flow

## Final confirmation

The backend currently supports:

- atomic signup with workspace creation
- legacy signup without workspace creation
- unchanged login and refresh flows
- unchanged tenant switch flow

Frontend can start implementation against this contract.
