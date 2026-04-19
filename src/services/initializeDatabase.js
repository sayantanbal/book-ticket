import { pool } from "../config/db.js";
import { MOCK_MOVIES } from "../config/movies.js";

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movies (
      id INT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      language VARCHAR(100) NOT NULL,
      duration_mins INT NOT NULL CHECK (duration_mins > 0)
    )
  `);

  for (const movie of MOCK_MOVIES) {
    await pool.query(
      `
        INSERT INTO movies (id, title, language, duration_mins)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          language = EXCLUDED.language,
          duration_mins = EXCLUDED.duration_mins
      `,
      [movie.id, movie.title, movie.language, movie.durationMins],
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seats (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      isbooked BOOLEAN DEFAULT FALSE
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

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'seats'
          AND column_name = 'isbooked'
          AND data_type <> 'boolean'
      ) THEN
        ALTER TABLE seats
        ALTER COLUMN isbooked DROP DEFAULT;

        ALTER TABLE seats
        ALTER COLUMN isbooked TYPE BOOLEAN
        USING (CASE WHEN isbooked::int = 0 THEN FALSE ELSE TRUE END);
      END IF;
    END
    $$;
  `);

  await pool.query("UPDATE seats SET movie_id = 1 WHERE movie_id IS NULL");
  await pool.query(
    "UPDATE seats SET seat_number = id WHERE seat_number IS NULL",
  );
  await pool.query("UPDATE seats SET isbooked = FALSE WHERE isbooked IS NULL");

  await pool.query("ALTER TABLE seats ALTER COLUMN movie_id SET NOT NULL");
  await pool.query("ALTER TABLE seats ALTER COLUMN seat_number SET NOT NULL");
  await pool.query("ALTER TABLE seats ALTER COLUMN isbooked SET NOT NULL");
  await pool.query("ALTER TABLE seats ALTER COLUMN isbooked SET DEFAULT FALSE");

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seats_movie_id_seat_number_key
    ON seats(movie_id, seat_number)
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'seats_movie_id_fkey'
      ) THEN
        ALTER TABLE seats
        ADD CONSTRAINT seats_movie_id_fkey
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE;
      END IF;
    END
    $$;
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

  await pool.query(`
    UPDATE bookings b
    SET movie_id = s.movie_id
    FROM seats s
    WHERE b.seat_id = s.id
      AND b.movie_id <> s.movie_id
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bookings_movie_id_fkey'
      ) THEN
        ALTER TABLE bookings
        ADD CONSTRAINT bookings_movie_id_fkey
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON bookings(user_id)",
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id)",
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON refresh_tokens(expires_at)",
  );

  const movieIds = MOCK_MOVIES.map((movie) => movie.id);
  await pool.query(
    `
      INSERT INTO seats (movie_id, seat_number, name, isbooked)
      SELECT movie_seed.movie_id, seat_seed.seat_number, NULL, FALSE
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
