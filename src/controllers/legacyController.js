import { env } from "../config/env.js";
import { pool } from "../config/db.js";
import { HttpError } from "../errors/HttpError.js";

export async function getLegacySeats(req, res) {
  const result = await pool.query(
    "SELECT * FROM seats WHERE movie_id = 1 ORDER BY seat_number",
  );
  res.send(result.rows);
}

export async function bookLegacySeat(req, res) {
  const conn = await pool.connect();
  let committed = false;

  try {
    const { id, name } = req.params;
    const seatId = Number(id);
    const seatOwnerName = (name || "").trim();

    if (!Number.isInteger(seatId) || seatId < 1 || !seatOwnerName) {
      throw new HttpError(400, "Valid seat id and name are required", {
        code: "INVALID_LEGACY_INPUT",
      });
    }

    if (
      env.protectLegacyRoutes &&
      req.user &&
      req.user.name.toLowerCase() !== seatOwnerName.toLowerCase()
    ) {
      throw new HttpError(
        403,
        "Legacy booking name must match logged-in user",
        {
          code: "LEGACY_NAME_MISMATCH",
        },
      );
    }

    await conn.query("BEGIN");

    const sql =
      "SELECT * FROM seats where id = $1 and movie_id = 1 and isbooked = FALSE FOR UPDATE";
    const result = await conn.query(sql, [seatId]);

    if (result.rowCount === 0) {
      throw new HttpError(409, "Seat already booked", {
        code: "SEAT_ALREADY_BOOKED",
      });
    }

    const sqlUpdate =
      "update seats set isbooked = TRUE, name = $2 where id = $1";
    const updateResult = await conn.query(sqlUpdate, [seatId, seatOwnerName]);

    await conn.query("COMMIT");
    committed = true;
    res.send(updateResult);
  } catch (error) {
    if (!committed) {
      await conn.query("ROLLBACK");
    }
    throw error;
  } finally {
    conn.release();
  }
}
