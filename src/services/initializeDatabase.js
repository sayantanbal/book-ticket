import { pool } from "../config/db.js";
import { MOCK_MOVIES } from "../config/movies.js";

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seats (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      isbooked INT DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(
    "ALTER TABLE seats ADD COLUMN IF NOT EXISTS movie_id INT DEFAULT 1",
  );
  await pool.query(
    "ALTER TABLE seats ADD COLUMN IF NOT EXISTS seat_number INT",
  );
  await pool.query("UPDATE seats SET movie_id = 1 WHERE movie_id IS NULL");
  await pool.query(
    "UPDATE seats SET seat_number = id WHERE seat_number IS NULL",
  );

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seats_movie_id_seat_number_key
    ON seats(movie_id, seat_number)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seat_id INT NOT NULL UNIQUE REFERENCES seats(id) ON DELETE CASCADE,
      movie_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const movieIds = MOCK_MOVIES.map((movie) => movie.id);
  await pool.query(
    `
      INSERT INTO seats (movie_id, seat_number, name, isbooked)
      SELECT movie_seed.movie_id, seat_seed.seat_number, NULL, 0
      FROM unnest($1::int[]) AS movie_seed(movie_id)
      CROSS JOIN generate_series(1, 20) AS seat_seed(seat_number)
      WHERE NOT EXISTS (
        SELECT 1
        FROM seats
        WHERE seats.movie_id = movie_seed.movie_id
          AND seats.seat_number = seat_seed.seat_number
      )
    `,
    [movieIds],
  );
}
