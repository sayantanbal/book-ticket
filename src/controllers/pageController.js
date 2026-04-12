import { ENDPOINT_TESTER_HTML_PATH, INDEX_HTML_PATH } from "../config/paths.js";

export function serveHomePage(req, res) {
  res.sendFile(INDEX_HTML_PATH);
}

export function serveEndpointTesterPage(req, res) {
  res.sendFile(ENDPOINT_TESTER_HTML_PATH);
}

export function serveHealth(req, res) {
  res.status(200).json({ status: "ok" });
}
