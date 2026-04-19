export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const { method, originalUrl } = req;

  res.on("finish", () => {
    const finishedAt = process.hrtime.bigint();
    const durationMs = Number(finishedAt - startedAt) / 1_000_000;
    const actor = req.user?.userId
      ? `user=${req.user.userId}`
      : "user=anonymous";

    console.log(
      `${method} ${originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms ${actor}`,
    );
  });

  next();
}
