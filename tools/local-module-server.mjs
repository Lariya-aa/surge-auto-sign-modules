import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sites = ["psnine", "keylol", "linuxdo", "gamer"];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const host = argValue("--host", "127.0.0.1");
const port = Number(argValue("--port", "8787"));

function contentType(filePath) {
  if (filePath.endsWith(".sgmodule")) return "text/plain; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function localModule(site, baseUrl) {
  const modulePath = path.join(root, "modules", `${site}.sgmodule`);
  let text = fs.readFileSync(modulePath, "utf8");
  text = text.replace(/script-path\s*=\s*(?:\.\/|https?:\/\/[^,\s]+\/)scripts\/dist\/([a-z0-9_-]+\.js)/gi, (_match, file) => {
    return `script-path=${baseUrl}/scripts/dist/${file}`;
  });
  return text;
}

function landingPage(baseUrl) {
  const rows = sites.map((site) => `${site}: ${baseUrl}/local/modules/${site}.sgmodule`).join("\n");
  return [
    "Local Surge module URLs",
    "",
    rows,
    "",
    "Use /local/modules/<site>.sgmodule in Surge GUI.",
    "Keep this server running while testing local modules."
  ].join("\n");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  const baseUrl = `http://${req.headers.host || `${host}:${port}`}`;

  if (url.pathname === "/" || url.pathname === "/index.txt") {
    send(res, 200, landingPage(baseUrl));
    return;
  }

  const localMatch = url.pathname.match(/^\/local\/modules\/([a-z0-9_-]+)\.sgmodule$/i);
  if (localMatch) {
    const site = localMatch[1].toLowerCase();
    if (!sites.includes(site)) {
      send(res, 404, "Unknown module");
      return;
    }
    send(res, 200, localModule(site, baseUrl));
    return;
  }

  const decoded = decodeURIComponent(url.pathname);
  const filePath = path.resolve(root, decoded.replace(/^\/+/, ""));
  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, "Not found");
    return;
  }

  send(res, 200, fs.readFileSync(filePath), contentType(filePath));
});

server.listen(port, host, () => {
  const baseUrl = `http://${host}:${port}`;
  console.log(landingPage(baseUrl));
});
