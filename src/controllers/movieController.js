import { pool } from "../config/db.js";
import { MOCK_MOVIES } from "../config/movies.js";

export function getMovies(req, res) {
  res.send(MOCK_MOVIES);
}

export async function getMovieSeats(req, res) {
  try {
    const movieId = Number(req.params.movieId);
    const movie = MOCK_MOVIES.find((item) => item.id === movieId);

    if (!movie) {
      res.status(404).send({ error: "Movie not found" });
      return;
    }

    const seatResult = await pool.query(
      "SELECT id, movie_id, seat_number, isbooked, name FROM seats WHERE movie_id = $1 ORDER BY seat_number",
      [movieId],
    );

    res.send({
      movie,
      seats: seatResult.rows,
    });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
}

export async function createBooking(req, res) {
  const conn = await pool.connect();

  try {
    const movieId = Number(req.params.movieId);
    const movie = MOCK_MOVIES.find((item) => item.id === movieId);
    const { seatNumber } = req.body;

    if (!movie) {
      res.status(404).send({ error: "Movie not found" });
      return;
    }

    if (!Number.isInteger(seatNumber) || seatNumber < 1) {
      res.status(400).send({ error: "Valid seatNumber is required" });
      return;
    }

    await conn.query("BEGIN");

    const seatResult = await conn.query(
      "SELECT id, isbooked FROM seats WHERE movie_id = $1 AND seat_number = $2 FOR UPDATE",
      [movieId, seatNumber],
    );

    if (seatResult.rowCount === 0) {
      await conn.query("ROLLBACK");
      res.status(404).send({ error: "Seat not found" });
      return;
    }

    const seat = seatResult.rows[0];
    if (seat.isbooked) {
      await conn.query("ROLLBACK");
      res.status(409).send({ error: "Seat already booked" });
      return;
    }

    await conn.query("UPDATE seats SET isbooked = 1, name = $2 WHERE id = $1", [
      seat.id,
      req.user.name,
    ]);

    const bookingResult = await conn.query(
      "INSERT INTO bookings (user_id, seat_id, movie_id) VALUES ($1, $2, $3) RETURNING id, user_id, seat_id, movie_id, created_at",
      [req.user.userId, seat.id, movieId],
    );

    await conn.query("COMMIT");

    res.status(201).send({
      message: "Seat booked successfully",
      movie,
      seatNumber,
      booking: bookingResult.rows[0],
    });
  } catch (error) {
    await conn.query("ROLLBACK");

    if (error.code === "23505") {
      res.status(409).send({ error: "Seat already booked" });
      return;
    }

    console.error(error);
    res.sendStatus(500);
  } finally {
    conn.release();
  }
}

export async function getMyBookings(req, res) {
  try {
    const sql = `
      SELECT b.id AS booking_id, b.movie_id, b.created_at, s.seat_number
      FROM bookings b
      JOIN seats s ON s.id = b.seat_id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `;
    const result = await pool.query(sql, [req.user.userId]);
    const bookings = result.rows.map((booking) => ({
      ...booking,
      movie: MOCK_MOVIES.find((movie) => movie.id === booking.movie_id) || null,
    }));

    res.send(bookings);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
}
