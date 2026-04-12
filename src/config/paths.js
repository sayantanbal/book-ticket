import { resolve } from "path";

export const ROOT_DIR = process.cwd();
export const INDEX_HTML_PATH = resolve(ROOT_DIR, "index.html");
export const ENDPOINT_TESTER_HTML_PATH = resolve(
  ROOT_DIR,
  "endpoint-tester.html",
);
