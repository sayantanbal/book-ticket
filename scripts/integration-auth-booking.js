import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { pool } from "../src/config/db.js";
import { env, validateEnv } from "../src/config/env.js";
import { initializeDatabase } from "../src/services/initializeDatabase.js";

function buildCookieHeader(cookieJar) {
  return cookieJar.map((item) => item.raw).join("; ");
}

function mergeSetCookieHeaders(cookieJar, headers) {
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")]
        : [];

  for (const header of setCookies) {
    const firstChunk = header.split(";")[0]?.trim() || "";
    if (!firstChunk.includes("=")) {
      continue;
    }

    const [name, value] = firstChunk.split("=");
    const normalizedName = name.trim();
    const normalizedValue = value ?? "";

    const existingIndex = cookieJar.findIndex(
      (item) => item.name === normalizedName,
    );

    if (!normalizedValue) {
      if (existingIndex >= 0) {
        cookieJar.splice(existingIndex, 1);
      }
      continue;
    }

    const nextCookie = { name: normalizedName, raw: firstChunk };
    if (existingIndex >= 0) {
      cookieJar[existingIndex] = nextCookie;
    } else {
      cookieJar.push(nextCookie);
    }
  }
}

function createClient(baseUrl) {
  const cookieJar = [];

  return {
    async request(path, options = {}) {
      const { method = "GET", token, body } = options;
      const headers = {};

      if (token) {
        headers.authorization = `Bearer ${token}`;
      }

      if (cookieJar.length > 0) {
        headers.cookie = buildCookieHeader(cookieJar);
      }

      let payload;
      if (body !== undefined) {
        headers["content-type"] = "application/json";
        payload = JSON.stringify(body);
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: payload,
      });

      mergeSetCookieHeaders(cookieJar, response.headers);

      const text = await response.text();
      let data = {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }

      return { status: response.status, data };
    },
  };
}

async function main() {
  validateEnv();
  await initializeDatabase();

  const app = createApp();
  const server = app.listen(0);

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine integration test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const client = createClient(baseUrl);

  try {
    const runId = Date.now();
    const email = `itest_${runId}@example.com`;
    const name = `itest_${runId}`;
    const password = `A1a#${runId}Safe`;

    const register = await client.request("/auth/register", {
      method: "POST",
      body: { name, email, password },
    });

    assert.equal(register.status, 201, "register should return 201");
    assert.ok(register.data.token, "register should return token");
    assert.equal(
      register.data.user?.email,
      email,
      "register should return created user",
    );

    const refresh = await client.request("/auth/refresh", { method: "POST" });
    assert.equal(refresh.status, 200, "refresh should return 200");
    assert.ok(refresh.data.token, "refresh should return new access token");

    const accessToken = refresh.data.token;

    const movies = await client.request("/movies");
    assert.equal(movies.status, 200, "movies endpoint should return 200");
    assert.ok(
      Array.isArray(movies.data) && movies.data.length > 0,
      "movies should be non-empty",
    );

    const movieId = movies.data[0].id;
    const seats = await client.request(`/movies/${movieId}/seats`);
    assert.equal(seats.status, 200, "movie seats endpoint should return 200");

    const availableSeat = seats.data.seats?.find((seat) => !seat.isbooked);
    assert.ok(availableSeat, "expected at least one available seat");

    const booking = await client.request(`/movies/${movieId}/bookings`, {
      method: "POST",
      token: accessToken,
      body: { seatNumber: availableSeat.seat_number },
    });

    assert.equal(booking.status, 201, "booking should return 201");

    const duplicateBooking = await client.request(
      `/movies/${movieId}/bookings`,
      {
        method: "POST",
        token: accessToken,
        body: { seatNumber: availableSeat.seat_number },
      },
    );

    assert.equal(
      duplicateBooking.status,
      409,
      "duplicate booking should return 409",
    );

    const myBookings = await client.request("/me/bookings", {
      token: accessToken,
    });

    assert.equal(myBookings.status, 200, "my bookings should return 200");
    assert.ok(
      Array.isArray(myBookings.data),
      "my bookings should return a list",
    );
    assert.ok(
      myBookings.data.some(
        (item) =>
          item.movie_id === movieId &&
          item.seat_number === availableSeat.seat_number,
      ),
      "my bookings should include the newly booked seat",
    );

    if (env.protectLegacyRoutes) {
      const legacyAttempt = await client.request(`/${availableSeat.id}/guest`, {
        method: "PUT",
      });

      assert.equal(
        legacyAttempt.status,
        401,
        "legacy booking should be protected when PROTECT_LEGACY_ROUTES is enabled",
      );
    }

    const logout = await client.request("/auth/logout", { method: "POST" });
    assert.equal(logout.status, 200, "logout should return 200");

    const refreshAfterLogout = await client.request("/auth/refresh", {
      method: "POST",
    });
    assert.equal(
      refreshAfterLogout.status,
      401,
      "refresh should fail after logout revokes refresh token",
    );

    console.log("Integration test passed: auth and booking flows are stable.");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Integration test failed", error);
  process.exit(1);
});
