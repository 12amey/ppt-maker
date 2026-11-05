import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logs = join(root, ".cache", "creative-hub");
mkdirSync(logs, { recursive: true });
const env = { ...process.env };
const dotEnv = join(root, ".env");
if (existsSync(dotEnv)) {
  for (const line of readFileSync(dotEnv, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
const imageMagickDir = join(root, "electron", "resources", "imagemagick", `${process.platform}-${process.arch}`);
const imageMagickManifestPath = join(imageMagickDir, "presenton-runtime.json");
if (existsSync(imageMagickManifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(imageMagickManifestPath, "utf8"));
    const imageMagickBinary = join(imageMagickDir, manifest.binary || (process.platform === "win32" ? "magick.exe" : "bin/magick"));
    if (existsSync(imageMagickBinary)) {
      env.IMAGEMAGICK_BINARY = imageMagickBinary;
      env.MAGICK_HOME = imageMagickDir;
      env.MAGICK_CONFIGURE_PATH = imageMagickDir;
      const pathKey = process.platform === "win32" && process.env.Path !== undefined ? "Path" : "PATH";
      const inheritedPath = env[pathKey] || env.PATH || env.Path || "";
      env[pathKey] = [imageMagickDir, inheritedPath].filter(Boolean).join(delimiter);
      if (pathKey === "Path") delete env.PATH;
      else delete env.Path;
    }
  } catch (error) {
    console.warn("Could not read the bundled ImageMagick runtime manifest:", error);
  }
}
Object.assign(env, {
  APP_DATA_DIRECTORY: join(root, "app_data"),
  TEMP_DIRECTORY: join(logs, "temp"),
  EXPORT_PACKAGE_ROOT: join(root, "presentation-export"),
  DISABLE_AUTH: "true", NEXT_PUBLIC_DISABLE_AUTH: "true",
  DISABLE_ANONYMOUS_TRACKING: "true", PRESENTON_COMMUNITY_ENABLED: "false",
  PRESENTON_LOCAL_BACKEND_URL: "http://127.0.0.1:8000",
  PRESENTON_LOCAL_SOURCE: "true",
  NEXT_PUBLIC_FAST_API: "http://127.0.0.1:8000", NEXT_PUBLIC_URL: "http://localhost:3000",
  PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  MIGRATE_DATABASE_ON_STARTUP: "true",
});
mkdirSync(env.TEMP_DIRECTORY, { recursive: true });
const backend = join(root, "servers", "fastapi");
const frontend = join(root, "servers", "nextjs");
const python = join(backend, ".venv", "Scripts", "python.exe");
if (!existsSync(python)) throw new Error("Install backend dependencies first: cd servers/fastapi; uv sync --group dev");
const backendPort = env.PRESENTON_BACKEND_PORT || "8000";
const frontendPort = env.PRESENTON_FRONTEND_PORT || "3000";
const backendUrl = `http://127.0.0.1:${backendPort}`;
env.PRESENTON_LOCAL_BACKEND_URL = backendUrl;
env.NEXT_PUBLIC_FAST_API = backendUrl;
env.NEXT_PUBLIC_URL = `http://localhost:${frontendPort}`;
const processes = [];
function start(name, command, args, cwd) {
  const log = createWriteStream(join(logs, `${name}.log`), { flags: "a" });
  const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.on("error", error => { log.write(`${error.stack}\n`); shutdown(1); });
  child.on("exit", code => { if (!stopping) shutdown(code || 1); });
  processes.push(child);
}
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill();
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown()); process.on("SIGTERM", () => shutdown());
let backendReady = false;
try {
  const response = await fetch(`${backendUrl}/api/v1/auth/status`, { signal: AbortSignal.timeout(2000) });
  backendReady = response.ok;
} catch { /* Start the local backend below when no healthy instance is available. */ }
if (!backendReady) start("backend", python, ["server.py", "--port", backendPort], backend);
for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
  try {
    const response = await fetch(`${backendUrl}/api/v1/auth/status`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) { backendReady = true; break; }
  } catch { /* Backend migrations and template import can take time on first launch. */ }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!backendReady) { shutdown(1); throw new Error("Backend did not become ready. See backend.log."); }
start("frontend", process.execPath, [join(frontend, "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", frontendPort], frontend);
writeFileSync(join(logs, "processes.json"), JSON.stringify({ launcher: process.pid, children: processes.map(child => child.pid) }));
