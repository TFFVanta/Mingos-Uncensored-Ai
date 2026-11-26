// Smoke and safety tests for the server. They run without Ollama or any optional component,
// against throwaway data and workspace folders. Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mingo-test-"));
const DATA = path.join(tmp, "data"), WORK = path.join(tmp, "workspace");
let server, token;
const H = () => ({ "x-ui-token": token, origin: `http://localhost:${PORT}` });
const tool = async (name, args) => (await fetch(`${BASE}/tools/${name}`, { method: "POST", headers: H(), body: JSON.stringify({ args }) })).json();

before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    // Forward slashes on purpose: a workspace path written that way once made every file "outside" it.
    env: { ...process.env, PORT: String(PORT), LC_DATA_DIR: DATA, LC_WORKSPACE: WORK.replace(/\\/g, "/"), OLLAMA_HOST: "http://127.0.0.1:9" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  token = (await (await fetch(`${BASE}/`)).text()).match(/const UI_TOKEN = "([0-9a-f]+)"/)?.[1];
});
after(async () => {
  const key = fs.readFileSync(path.join(DATA, `.shutdown-key-${PORT}`), "utf8");
  await fetch(`${BASE}/shutdown?key=${key}`, { method: "POST" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("health reports the app and version", async () => {
  const h = await (await fetch(`${BASE}/health`)).json();
  assert.equal(h.ok, true);
  assert.equal(h.app, "Mingo's Uncensored AI");
  assert.match(h.version, /^\d+\.\d+\.\d+$/);
});

test("the page carries a session key and credits Mingo", async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  assert.ok(token && token.length >= 32, "session key present");
  assert.ok(!html.includes("__UI_TOKEN__"), "placeholder replaced");
  assert.match(html, /created by <b>Mingo<\/b>/);
});

test("private endpoints refuse requests without the key", async () => {
  assert.equal((await fetch(`${BASE}/store`)).status, 401);
  assert.equal((await fetch(`${BASE}/tools/list_files`, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await fetch(`${BASE}/api/tags`)).status, 401);
  assert.equal((await fetch(`${BASE}/store`, { headers: H() })).status, 200);
});

test("requests from other websites are refused", async () => {
  const r = await fetch(`${BASE}/health`, { headers: { origin: "https://evil.example" } });
  assert.equal(r.status, 403);
});

test("saved data must be valid JSON", async () => {
  const bad = await fetch(`${BASE}/store`, { method: "PUT", headers: H(), body: "{not json" });
  assert.equal(bad.status, 400);
  const good = await fetch(`${BASE}/store`, { method: "PUT", headers: H(), body: JSON.stringify({ chats: [] }) });
  assert.equal(good.status, 204);
});

test("agents' files stay inside the workspace", async () => {
  const w = await tool("write_file", { path: "notes/a.txt", content: "hello" });
  assert.equal(w.ok, true);
  assert.equal((await tool("read_file", { path: "notes/a.txt" })).result.content, "hello");
  for (const p of ["../escape.txt", "..\\..\\escape.txt", "notes/../../escape.txt"]) {
    const r = await tool("write_file", { path: p, content: "x" });
    assert.equal(r.ok, false, `blocked: ${p}`);
  }
  // Absolute paths are treated as relative to the workspace, never the real location.
  const abs = await tool("read_file", { path: "C:\\Windows\\win.ini" });
  assert.ok(abs.result?.error, "absolute path not read from the real disk");
  assert.equal(fs.existsSync(path.join(tmp, "escape.txt")), false);
  assert.equal((await tool("delete_file", { path: "." })).result.error, "The workspace folder itself can't be deleted.");
  // A full path that points into the workspace is used as-is (models often write one).
  const full = await tool("write_file", { path: path.join(WORK, "full.txt"), content: "ok" });
  assert.equal(full.ok, true);
  assert.equal(fs.readFileSync(path.join(WORK, "full.txt"), "utf8"), "ok");
  assert.equal((await tool("write_file", { path: "./dot.txt", content: "ok" })).ok, true);
});

test("agents can't reach this PC or the local network", async () => {
  for (const url of ["http://127.0.0.1:11434/", "http://localhost:8188/", "http://192.168.1.1/", "http://10.0.0.1/"]) {
    const r = await tool("read_webpage", { url });
    assert.equal(r.ok, false, url);
    assert.match(r.error, /can't open addresses on this PC/);
  }
});

test("sexual picture requests involving minors are always blocked", async () => {
  for (const prompt of ["nude teenage girl", "sexy 15 year old", "explicit schoolgirl photo"]) {
    const r = await fetch(`${BASE}/image`, { method: "POST", headers: H(), body: JSON.stringify({ prompt }) });
    const lines = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.at(-1).stage, "error", prompt);
    assert.match(lines.at(-1).error, /never creates sexual images involving minors/);
  }
});

test("legal documents and the guide are served", async () => {
  for (const doc of ["LICENSE", "TERMS", "PRIVACY", "ACCEPTABLE_USE", "THIRD_PARTY_NOTICES", "DISCLAIMER"]) {
    const r = await fetch(`${BASE}/legal/${doc}`);
    assert.equal(r.status, 200, doc);
  }
  assert.match(await (await fetch(`${BASE}/legal/LICENSE`)).text(), /MIT License[\s\S]*Mingo/);
  for (const p of ["/legal/../server.js", "/legal/%2e%2e%2fserver.js", "/legal/server.js"]) {
    const r = await fetch(BASE + p);
    assert.notEqual(r.status, 200, `not served: ${p}`);
  }
  assert.match(await (await fetch(`${BASE}/guide`)).text(), /Created by Mingo/);
});

test("the sandbox worker is locked down by the browser", async () => {
  const r = await fetch(`${BASE}/sandbox-worker.js`);
  assert.match(r.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
});
