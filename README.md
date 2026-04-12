# Book My Ticket

Book My Ticket is a backend-first movie seat booking project built to solve one core problem safely: multiple users trying to reserve the same seat at nearly the same time.

The implementation uses:
- JWT authentication for protected actions
- PostgreSQL as source of truth
- Transaction and row locking (`FOR UPDATE`) to prevent double booking
- A main booking UI and a dedicated endpoint tester UI for API-level validation

---

## 1. Problem Statement and Solution Approach

### Problem to solve
In a ticketing system, a seat must be booked by at most one user. If two requests hit the backend at almost the same time, a naive implementation can mark the same seat as booked twice.

### Approach used in this project
1. Keep seat state in PostgreSQL.
2. Require authentication for booking endpoints.
3. Use one DB transaction per booking request.
4. Lock the target seat row (`SELECT ... FOR UPDATE`) before deciding availability.
5. Commit only after updating seat status and inserting booking record.

### Why this works
When one request locks a seat row, concurrent requests for that same row must wait. By the time the next request continues, it sees the updated seat state and fails safely with a conflict response.

---

## 2. High-Level Architecture

### Runtime layers
- Entry point: `index.js`
- Startup and bootstrapping: `src/server.js`
- App wiring and middleware setup: `src/app.js`
- Route definitions: `src/routes/*`
- Request handlers: `src/controllers/*`
- Shared infrastructure: `src/config/*`, `src/lib/*`, `src/middleware/*`, `src/services/*`
- Frontend screens served by Express:
  - Main UI: `index.html`
  - Endpoint tester UI: `endpoint-tester.html`

### Request path (generic)
Client -> Route -> Middleware (if any) -> Controller -> DB -> JSON/HTML response

---

## 3. Detailed Project Structure

```text
book-my-ticket/
  index.js                      # Thin entrypoint that imports src/server.js
  index.html                    # Main booking UI (auth + movies + seats + my bookings)
  endpoint-tester.html          # Dedicated endpoint testing screen
  src/
    app.js                      # Express app wiring and route registration
    server.js                   # Env validation, DB init, and app.listen
    config/
      env.js                    # .env loading + env parsing + validation
      db.js                     # pg pool creation + SSL behavior
      movies.js                 # Mock movies metadata used by APIs and UI
      paths.js                  # Absolute paths to html pages
    controllers/
      authController.js         # register/login handlers
      movieController.js        # movies, seats, booking, and my bookings handlers
      legacyController.js       # backward-compatible old endpoints
      pageController.js         # serves index.html, endpoint-tester.html, /health
    middleware/
      authenticate.js           # Bearer token verification
      authRateLimiter.js        # auth endpoint rate limiting
    routes/
      authRoutes.js             # /auth/register and /auth/login
      movieRoutes.js            # /movies, /me/bookings, booking APIs
      legacyRoutes.js           # /seats and /:id/:name
      pageRoutes.js             # /, /endpoint-tester, /health
    services/
      initializeDatabase.js     # schema creation + seat seeding
  postman/
    book-my-ticket.postman_collection.json
```

---

## 4. Tech Stack

- Node.js (ESM modules)
- Express 5
- PostgreSQL via `pg`
- `bcryptjs` for password hashing
- `jsonwebtoken` for JWT create/verify
- `express-rate-limit` for `/auth/*` throttling
- `dotenv` for environment file loading

---

## 5. Environment Variables and Resolution Rules

The app loads:
1. `.env.local`
2. `.env`

Important: `dotenv` does not override an already-set variable by default. So the first loaded value usually wins unless the variable is absent.

### Required
- `JWT_SECRET`

### Optional app variables
- `PORT` (default: `8080`)
- `NODE_ENV` (default: `development`)

### DB variables (URL mode)
- `DATABASE_URL`
- `POSTGRES_URL` (fallback alias)
- `DB_SSL` (optional explicit `true` or `false`)
- `DB_SSL_REJECT_UNAUTHORIZED` (optional, default `false`)

### DB variables (host/port mode fallback)
Used only when URL mode is not provided.
- `DB_HOST` (default: `localhost`)
- `DB_PORT` (default: `5432`)
- `DB_USER` (default: `postgres`)
- `DB_PASSWORD` (default: `postgres`)
- `DB_NAME` (default: `sql_class_2_db`)

### SSL behavior for URL-based DB
If `DB_SSL` is not provided:
- SSL defaults to off for `localhost` and `127.0.0.1`
- SSL defaults to on for non-local hosts
- If URL contains `sslmode`, it is respected (`disable` turns SSL off)

---

## 6. Database Schema and Data Model

### `users`
- `id` (PK)
- `name` (required)
- `email` (required, unique)
- `password_hash` (required)
- `created_at`

### `seats`
- `id` (PK)
- `name` (name of person who booked in current model)
- `isbooked` (`0` or `1` int)
- `movie_id` (added for multi-movie seat maps)
- `seat_number` (logical seat number within movie)
- unique index on (`movie_id`, `seat_number`)

### `bookings`
- `id` (PK)
- `user_id` (FK -> users.id)
- `seat_id` (FK -> seats.id, unique)
- `movie_id`
- `created_at`

### Seed behavior
On startup, for every movie in `MOCK_MOVIES`, seats `1..20` are inserted if missing.

---

## 7. Startup Lifecycle: How the App Boots

Startup sequence from `src/server.js`:

1. `validateEnv()` ensures `JWT_SECRET` exists.
2. `initializeDatabase()` runs schema migration-like setup.
3. `createApp()` builds the Express app.
4. `app.listen(env.port)` starts HTTP server.

If database initialization fails, startup stops and process exits with code `1`.

---

## 8. Database Initialization Step-by-Step

`initializeDatabase()` performs the following in order:

1. Create `seats` table if absent.
2. Create `users` table if absent.
3. Add `movie_id` column to `seats` if absent.
4. Add `seat_number` column to `seats` if absent.
5. Backfill null `movie_id` to `1` for old rows.
6. Backfill null `seat_number` using existing `id` for old rows.
7. Create unique index `seats_movie_id_seat_number_key`.
8. Create `bookings` table if absent.
9. Seed missing seats (`1..20`) per movie.

This makes repeated startups idempotent and safe for existing local data.

---

## 9. Data Flow: End-to-End Scenarios

### 9.1 Register -> Login -> Book

1. User registers via `POST /auth/register`.
2. Backend validates fields and password length (`>= 6`).
3. Password is hashed with bcrypt.
4. User row is inserted in `users`.
5. JWT token is issued with payload: `userId`, `name`, `email`.
6. Client stores token and user in `localStorage`.
7. User requests `GET /movies` and selects a movie.
8. User requests `GET /movies/:movieId/seats`.
9. User books seat via `POST /movies/:movieId/bookings` with Bearer token.
10. Backend authenticates token.
11. Backend opens transaction and locks seat row.
12. Backend marks seat booked + inserts into `bookings`.
13. Backend commits.
14. Client refreshes seat map and my bookings (`GET /me/bookings`).

### 9.2 Protected route authorization flow

1. Client sends `Authorization: Bearer <token>`.
2. `authenticate` middleware parses header.
3. `verifyToken` validates signature and expiry.
4. Decoded payload is attached to `req.user`.
5. Controller uses `req.user.userId` and `req.user.name`.

If token is missing or invalid, request ends with `401`.

### 9.3 Concurrency-safe booking flow

1. Request A and Request B try to book same `(movie_id, seat_number)`.
2. Request A acquires row lock first.
3. Request B waits on lock.
4. Request A updates row (`isbooked=1`) and inserts booking, then commits.
5. Request B resumes, sees seat already booked, rolls back, returns `409`.

### 9.4 Legacy flow (backward compatibility)

- `GET /seats` returns seats only for `movie_id = 1`.
- `PUT /:id/:name` books seat by physical row `id` and path `name`.
- Uses transaction + lock as well, but does not use JWT.

---

## 10. Complete Endpoint Reference (Detailed)

Base URL (local): `http://localhost:8080`

### 10.1 Page and Health Routes

### `GET /`
- Purpose: serves main booking UI (`index.html`)
- Auth: no
- Response: HTML page

### `GET /endpoint-tester`
- Purpose: serves endpoint tester UI (`endpoint-tester.html`)
- Auth: no
- Response: HTML page

### `GET /health`
- Purpose: quick uptime check
- Auth: no
- Success response:

```json
{ "status": "ok" }
```

### 10.2 Auth Routes

All `/auth/*` routes are rate limited: `10 requests / 15 minutes / IP`.

### `POST /auth/register`

Creates a user and returns a JWT.

Request body:

```json
{
  "name": "Sayantan",
  "email": "sayantan@example.com",
  "password": "secret123"
}
```

Validation:
- `name`, `email`, `password` required
- `email` normalized to lowercase
- `password` length must be at least 6

Success (`201`):

```json
{
  "message": "User registered successfully",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "name": "Sayantan",
    "email": "sayantan@example.com"
  }
}
```

Common failures:
- `400` missing required field / short password
- `409` email already exists
- `429` too many auth attempts

### `POST /auth/login`

Logs user in and returns a JWT.

Request body:

```json
{
  "email": "sayantan@example.com",
  "password": "secret123"
}
```

Validation:
- `email` and `password` required
- `email` normalized to lowercase

Success (`200`):

```json
{
  "message": "Login successful",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "name": "Sayantan",
    "email": "sayantan@example.com"
  }
}
```

Common failures:
- `400` missing credentials
- `401` invalid credentials
- `429` too many auth attempts

### 10.3 Movie and Seat Routes

### `GET /movies`
- Purpose: returns mocked movie list
- Auth: no
- Success (`200`):

```json
[
  { "id": 1, "title": "Dhurandhar The Revenge", "language": "Hindi", "durationMins": 235 },
  { "id": 2, "title": "Code Runner", "language": "English", "durationMins": 128 },
  { "id": 3, "title": "Silent Algorithm", "language": "Japanese", "durationMins": 118 }
]
```

### `GET /movies/:movieId/seats`
- Purpose: returns one movie with all seats for that movie
- Auth: no

Success (`200`) shape:

```json
{
  "movie": {
    "id": 1,
    "title": "Dhurandhar The Revenge",
    "language": "Hindi",
    "durationMins": 235
  },
  "seats": [
    { "id": 1, "movie_id": 1, "seat_number": 1, "isbooked": 0, "name": null }
  ]
}
```

Common failures:
- `404` movie not found

### 10.4 Protected Booking Routes

### `POST /movies/:movieId/bookings`
- Purpose: reserve one seat in one movie
- Auth: required (`Authorization: Bearer <token>`)

Request body:

```json
{
  "seatNumber": 5
}
```

Validation and checks:
- movie must exist
- `seatNumber` must be a positive integer
- seat row must exist for that movie
- seat must not already be booked

Transaction logic:
1. `BEGIN`
2. lock seat row with `FOR UPDATE`
3. check booked state
4. `UPDATE seats SET isbooked = 1, name = req.user.name`
5. `INSERT INTO bookings`
6. `COMMIT`

Success (`201`):

```json
{
  "message": "Seat booked successfully",
  "movie": {
    "id": 1,
    "title": "Dhurandhar The Revenge",
    "language": "Hindi",
    "durationMins": 235
  },
  "seatNumber": 5,
  "booking": {
    "id": 12,
    "user_id": 1,
    "seat_id": 5,
    "movie_id": 1,
    "created_at": "2026-01-01T12:00:00.000Z"
  }
}
```

Common failures:
- `400` invalid seat number
- `401` missing/invalid token
- `404` movie not found
- `404` seat not found
- `409` seat already booked

### `GET /me/bookings`
- Purpose: list bookings of current authenticated user
- Auth: required

Success (`200`):

```json
[
  {
    "booking_id": 12,
    "movie_id": 1,
    "created_at": "2026-01-01T12:00:00.000Z",
    "seat_number": 5,
    "movie": {
      "id": 1,
      "title": "Dhurandhar The Revenge",
      "language": "Hindi",
      "durationMins": 235
    }
  }
]
```

Common failures:
- `401` missing/invalid token

### 10.5 Legacy Endpoints

### `GET /seats`
- Purpose: old seat endpoint (movie 1 only)
- Auth: no

### `PUT /:id/:name`
- Purpose: old booking endpoint
- Auth: no
- Uses transaction + row lock
- Success returns PostgreSQL update metadata
- If seat already booked, returns payload `{ "error": "Seat already booked" }`

Note: this route exists for backward compatibility and bypasses JWT.

---

## 11. Frontend Data Flow

### Main UI (`/`)

Capabilities:
- Login/register
- Movie selection
- Seat map rendering
- Direct booking action
- My bookings panel
- Link to dedicated endpoint tester

State stored in browser:
- `bmt_token` in `localStorage`
- `bmt_user` in `localStorage`

Main UI request pattern:
1. On bootstrap: hydrate session from `localStorage`
2. Fetch movies (`GET /movies`)
3. Fetch seats for selected movie
4. If logged in, fetch my bookings
5. On booking click, call protected booking API and refresh seats + bookings

### Dedicated endpoint tester (`/endpoint-tester`)

Capabilities:
- Manual request input fields (name/email/password/movie/seat)
- One-click run for each endpoint
- Shows request and response payload per endpoint
- Persists token/user in `localStorage`

This is useful for API debugging without Postman.

---

## 12. Run Locally (Step-by-Step, Detailed)

### 12.1 Prerequisites
- Node.js 18+
- PostgreSQL running locally
- Access to create a database

### 12.2 Install dependencies

```bash
npm install
```

### 12.3 Create local env file

```bash
cp .env.example .env.local
```

Update `.env.local` with at least:

```env
JWT_SECRET=replace-with-a-strong-random-secret
PORT=8080
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=sql_class_2_db
```

### 12.4 Create the database (first time only)

Option A:

```bash
createdb sql_class_2_db
```

Option B:

```bash
psql -U postgres -c "CREATE DATABASE sql_class_2_db;"
```

### 12.5 Start the server

```bash
npm start
```

Available scripts:
- `npm start` -> starts server
- `npm run dev` -> currently same as start (no hot-reload watcher configured)

Server default URL:
- `http://localhost:8080`

### 12.6 Validate startup quickly

Health check:

```bash
curl http://localhost:8080/health
```

Expected:

```json
{ "status": "ok" }
```

---

## 13. Quick Functional Verification Flow

### 13.1 Via UI
1. Open `http://localhost:8080`
2. Register a user
3. Select movie
4. Click any available seat
5. Confirm seat becomes booked and appears in My Bookings

### 13.2 Via curl

Register:

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"secret123"}'
```

Login:

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}'
```

Copy `token` from login response, then:

```bash
curl -X POST http://localhost:8080/movies/1/bookings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"seatNumber":5}'
```

Get my bookings:

```bash
curl http://localhost:8080/me/bookings \
  -H "Authorization: Bearer <token>"
```

---

## 14. Deployment Notes

For Render/Railway/Fly/other platforms:
1. Set `JWT_SECRET`
2. Set `DATABASE_URL` or `POSTGRES_URL`
3. Set `NODE_ENV=production`
4. Start command: `npm start`

Neon is supported:
- A Neon URL with `?sslmode=require` works.
- SSL behavior can be forced using `DB_SSL` and `DB_SSL_REJECT_UNAUTHORIZED`.

---

## 15. Security and Reliability Notes

- Passwords are hashed using bcrypt (salt rounds: 10)
- JWT expires in 2 hours
- Auth routes are rate-limited
- Booking path uses transaction + row lock + conflict responses
- Protected routes reject missing/invalid tokens with `401`

---

## 16. Known Limitations and Future Improvements

- No automated tests yet (`npm test` is placeholder)
- Legacy booking route is unauthenticated and should be removed in a hardened production version
- Seat ownership display in UI relies on booked `name` matching current user name (not strict user id ownership)
- No refresh token mechanism for long-lived sessions

---

## 17. Postman

Import:
- `postman/book-my-ticket.postman_collection.json`

Collection includes:
- Register/login
- Movies and seats
- Protected booking APIs
- Legacy compatibility routes
