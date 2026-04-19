const SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
].join("; ");

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
].join(", ");

function isTlsRequest(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function securityHeaders(req, res, next) {
  res.setHeader("Content-Security-Policy", SECURITY_POLICY);
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  if (isTlsRequest(req)) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    );
  }

  next();
}
