import { pool } from "../config/db.js";
import { HttpError } from "../errors/HttpError.js";

async function getMovieById(movieId) {
  const result = await pool.query(
    `
      SELECT id, title, language, duration_mins AS "durationMins"
      FROM movies
      WHERE id = $1
    `,
    [movieId],
  );

  return result.rows[0] || null;
}

export async function getMovies(req, res) {
  const result = await pool.query(
    `
      SELECT id, title, language, duration_mins AS "durationMins"
      FROM movies
      ORDER BY id
    `,
  );

  res.send(result.rows);
}

export async function getMovieSeats(req, res) {
  const movieId = Number(req.params.movieId);
  const movie = await getMovieById(movieId);

  if (!movie) {
    throw new HttpError(404, "Movie not found", { code: "MOVIE_NOT_FOUND" });
  }

  const seatResult = await pool.query(
    `
      SELECT
        s.id,
        s.movie_id,
        s.seat_number,
        s.isbooked,
        s.name,
        b.user_id AS booked_by_user_id
      FROM seats s
      LEFT JOIN bookings b ON b.seat_id = s.id
      WHERE s.movie_id = $1
      ORDER BY s.seat_number
    `,
    [movieId],
  );

  res.send({
    movie,
    seats: seatResult.rows,
  });
}

export async function createBooking(req, res) {
  const conn = await pool.connect();
  let committed = false;

  try {
    const movieId = Number(req.params.movieId);
    const movie = await getMovieById(movieId);
    const { seatNumber } = req.body;

    if (!movie) {
      throw new HttpError(404, "Movie not found", { code: "MOVIE_NOT_FOUND" });
    }

    if (!Number.isInteger(seatNumber) || seatNumber < 1) {
      throw new HttpError(400, "Valid seatNumber is required", {
        code: "INVALID_SEAT_NUMBER",
      });
    }

    await conn.query("BEGIN");

    const seatResult = await conn.query(
      "SELECT id, isbooked FROM seats WHERE movie_id = $1 AND seat_number = $2 FOR UPDATE",
      [movieId, seatNumber],
    );

    if (seatResult.rowCount === 0) {
      throw new HttpError(404, "Seat not found", { code: "SEAT_NOT_FOUND" });
    }

    const seat = seatResult.rows[0];
    if (seat.isbooked) {
      throw new HttpError(409, "Seat already booked", {
        code: "SEAT_ALREADY_BOOKED",
      });
    }

    await conn.query(
      "UPDATE seats SET isbooked = TRUE, name = $2 WHERE id = $1",
      [seat.id, req.user.name],
    );

    const bookingResult = await conn.query(
      "INSERT INTO bookings (user_id, seat_id, movie_id) VALUES ($1, $2, $3) RETURNING id, user_id, seat_id, movie_id, created_at",
      [req.user.userId, seat.id, movieId],
    );

    await conn.query("COMMIT");
    committed = true;

    res.status(201).send({
      message: "Seat booked successfully",
      movie,
      seatNumber,
      booking: bookingResult.rows[0],
    });
  } catch (error) {
    if (!committed) {
      await conn.query("ROLLBACK");
    }

    if (error.code === "23505") {
      throw new HttpError(409, "Seat already booked", {
        code: "SEAT_ALREADY_BOOKED",
      });
    }

    throw error;
  } finally {
    conn.release();
  }
}

export async function getMyBookings(req, res) {
  const sql = `
    SELECT
      b.id AS booking_id,
      b.movie_id,
      b.created_at,
      s.seat_number,
      m.title,
      m.language,
      m.duration_mins AS "durationMins"
    FROM bookings b
    JOIN seats s ON s.id = b.seat_id
    LEFT JOIN movies m ON m.id = b.movie_id
    WHERE b.user_id = $1
    ORDER BY b.created_at DESC
  `;

  const result = await pool.query(sql, [req.user.userId]);
  const bookings = result.rows.map((booking) => ({
    booking_id: booking.booking_id,
    movie_id: booking.movie_id,
    created_at: booking.created_at,
    seat_number: booking.seat_number,
    movie: booking.title
      ? {
          id: booking.movie_id,
          title: booking.title,
          language: booking.language,
          durationMins: booking.durationMins,
        }
      : null,
  }));

  res.send(bookings);
}
