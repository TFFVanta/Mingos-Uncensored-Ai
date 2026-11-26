// Mingo's Uncensored AI code sandbox. Runs agents' Python (Pyodide: CPython compiled to WebAssembly) or JavaScript
// inside a browser worker. It has no access to your PC's files or programs, and network access is
// switched off before any agent code runs. Files live in an in-memory copy of the workspace.
let pyodide = null;
let ready = null;

function lockDown() {
  const deny = () => { throw new Error("Network access is turned off in the sandbox."); };
  for (const k of ["fetch", "importScripts"]) self[k] = deny;
  for (const k of ["XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker", "indexedDB", "caches", "BroadcastChannel", "WebTransport"]) {
    try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch {}
  }
  try { Object.defineProperty(self.navigator, "sendBeacon", { value: undefined }); } catch {}
}

async function init() {
  importScripts("/vendor/pyodide/pyodide.js");
  pyodide = await loadPyodide({ indexURL: "/vendor/pyodide/" });
  await pyodide.loadPackage(["numpy", "pandas", "matplotlib"], { messageCallback: () => {} });
  pyodide.runPython("import matplotlib\nmatplotlib.use('Agg')");
  pyodide.FS.mkdirTree("/workspace");
  lockDown();
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function hash(bytes) {   // cheap fingerprint to spot changed files
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return h + ":" + bytes.length;
}
function listFs(dir, out = []) {
  for (const name of pyodide.FS.readdir(dir)) {
    if (name === "." || name === "..") continue;
    const p = dir + "/" + name;
    const st = pyodide.FS.stat(p);
    if (pyodide.FS.isDir(st.mode)) listFs(p, out); else out.push(p);
  }
  return out;
}

async function runPython(code, files) {
  // Refresh the in-memory workspace with the real one.
  for (const p of listFs("/workspace")) pyodide.FS.unlink(p);
  const before = new Map();
  for (const f of files) {
    const full = "/workspace/" + f.path;
    pyodide.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
    const bytes = b64ToBytes(f.b64);
    pyodide.FS.writeFile(full, bytes);
    before.set(full, hash(bytes));
  }
  let stdout = "", stderr = "";
  pyodide.setStdout({ batched: (s) => { if (stdout.length < 40000) stdout += s + "\n"; } });
  pyodide.setStderr({ batched: (s) => { if (stderr.length < 20000) stderr += s + "\n"; } });
  pyodide.runPython("import os\nos.chdir('/workspace')");
  let exit = 0;
  try {
    await pyodide.loadPackagesFromImports(code, { messageCallback: () => {} }).catch(() => {});
    await pyodide.runPythonAsync(code);
  } catch (e) {
    exit = 1;
    stderr += String(e.message || e).split("\n").filter((l) => !l.includes("pyodide/")).slice(-15).join("\n");
  }
  // Save any matplotlib charts the code drew but didn't save.
  try {
    pyodide.runPython(`
import sys, time
if 'matplotlib.pyplot' in sys.modules:
    import matplotlib.pyplot as plt
    for n in plt.get_fignums():
        fig = plt.figure(n)
        if any(ax.has_data() for ax in fig.axes):
            fig.savefig(f'/workspace/chart_{int(time.time()*1000)}_{n}.png', dpi=110, bbox_inches='tight')
    plt.close('all')
`);
  } catch {}
  const changed = [];
  let total = 0;
  for (const p of listFs("/workspace")) {
    const bytes = pyodide.FS.readFile(p);
    if (before.get(p) === hash(bytes) || bytes.length > 20e6 || (total += bytes.length) > 40e6) continue;
    changed.push({ path: p.slice("/workspace/".length), b64: bytesToB64(bytes) });
  }
  return { exit_code: exit, stdout, stderr, files: changed };
}

async function runJs(code) {
  let stdout = "", stderr = "";
  const fmt = (a) => a.map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(" ");
  const con = { log: (...a) => (stdout += fmt(a) + "\n"), info: (...a) => (stdout += fmt(a) + "\n"), warn: (...a) => (stderr += fmt(a) + "\n"), error: (...a) => (stderr += fmt(a) + "\n") };
  try {
    await new Function("console", `"use strict"; return (async () => {\n${code}\n})();`)(con);
    return { exit_code: 0, stdout, stderr, files: [] };
  } catch (e) {
    return { exit_code: 1, stdout, stderr: stderr + String(e?.stack || e), files: [] };
  }
}

self.onmessage = async (e) => {
  const { id, language, code, files } = e.data;
  const t0 = performance.now();
  try {
    if (language === "javascript") {
      if (!ready) { ready = Promise.resolve(); lockDown(); }
      const r = await runJs(code);
      postMessage({ id, ok: true, result: { ...r, seconds: +((performance.now() - t0) / 1000).toFixed(2) } });
      return;
    }
    if (!pyodide) await (ready ??= init());
    const r = await runPython(code, files || []);
    postMessage({ id, ok: true, result: { ...r, seconds: +((performance.now() - t0) / 1000).toFixed(2) } });
  } catch (err) {
    postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
