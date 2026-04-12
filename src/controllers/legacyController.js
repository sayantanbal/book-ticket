import { pool } from "../config/db.js";

export async function getLegacySeats(req, res) {
  const result = await pool.query(
    "SELECT * FROM seats WHERE movie_id = 1 ORDER BY seat_number",
  );
  res.send(result.rows);
}

export async function bookLegacySeat(req, res) {
  const conn = await pool.connect();

  try {
    const { id, name } = req.params;

    await conn.query("BEGIN");

    const sql = "SELECT * FROM seats where id = $1 and isbooked = 0 FOR UPDATE";
    const result = await conn.query(sql, [id]);

    if (result.rowCount === 0) {
      await conn.query("ROLLBACK");
      res.send({ error: "Seat already booked" });
      return;
    }

    const sqlUpdate = "update seats set isbooked = 1, name = $2 where id = $1";
    const updateResult = await conn.query(sqlUpdate, [id, name]);

    await conn.query("COMMIT");
    res.send(updateResult);
  } catch (error) {
    await conn.query("ROLLBACK");
    console.error(error);
    res.sendStatus(500);
  } finally {
    conn.release();
  }
}
