// Mingo's Uncensored AI server: serves the app, saves your data to disk, and proxies /api/* to Ollama.
// No dependencies. Run: node server.js  ->  http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PORT = +process.env.PORT || 3000;
const OLLAMA = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
// LC_DATA_DIR / LC_WORKSPACE let the test suite run against throwaway folders instead of your real data.
const DATA_DIR = process.env.LC_DATA_DIR || path.join(__dirname, "data");
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const VERSION = PKG.version;
const APP_NAME = "Mingo's Uncensored AI";

// ---- logging: data\server.log, rotated at 2 MB so it never grows without limit ----
const LOG = path.join(DATA_DIR, "server.log");
function log(level, ...parts) {
  const line = `${new Date().toISOString()} [${level}] ${parts.map((p) => (p instanceof Error ? p.stack || p.message : typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2 * 1024 * 1024) fs.renameSync(LOG, LOG + ".1");
    fs.appendFileSync(LOG, line);
  } catch {}
  if (level !== "info") process.stderr.write(line);
}
// One bad request or tool must never take the whole app down.
process.on("uncaughtException", (e) => log("error", "uncaught:", e));
process.on("unhandledRejection", (e) => log("error", "unhandled promise:", e));
if (+process.versions.node.split(".")[0] < 22) { console.error(`${APP_NAME} needs Node.js 22 or newer (you have ${process.versions.node}).`); process.exit(1); }
const STORE = path.join(DATA_DIR, "store.json");
const BACKUP = path.join(DATA_DIR, "store.backup.json");

const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/icon.png": ["icon.png", "image/png"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
};

// Only this app may talk to the server: block other websites (Origin) and DNS-rebinding tricks (Host).
const okHost = (h) => h === `localhost:${PORT}` || h === `127.0.0.1:${PORT}`;
const okOrigin = (o) => !o || o === `http://localhost:${PORT}` || o === `http://127.0.0.1:${PORT}`;

function readBody(req, limit = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("Too large")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function saveStore(json) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Keep a backup that is at most an hour old, in case something goes wrong.
  try {
    if (fs.existsSync(STORE) && (!fs.existsSync(BACKUP) || Date.now() - fs.statSync(BACKUP).mtimeMs > 3600e3))
      fs.copyFileSync(STORE, BACKUP);
  } catch {}
  const tmp = STORE + ".tmp";
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, STORE);
}

// Best-effort text extraction from PDFs (works for normal text PDFs, not scanned images).
function pdfText(buf) {
  const src = buf.toString("latin1");
  const out = [];
  const streamRe = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = streamRe.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf("endstream", start);
    if (end < 0) break;
    let data = buf.subarray(start, end);
    if (/FlateDecode/.test(m[1])) { try { data = zlib.inflateSync(data); } catch { try { data = zlib.inflateRawSync(data.subarray(2)); } catch { continue; } } }
    else if (/\/Filter/.test(m[1])) continue; // images and other encodings
    const s = data.toString("latin1");
    if (!/\b(Tj|TJ)\b/.test(s)) continue;
    const lit = (t) => t.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) =>
      ({ n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" }[e] ?? String.fromCharCode(parseInt(e, 8))));
    const ops = /\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*Tj|(T\*|Td|TD|ET|')/g;
    let o, line = "";
    while ((o = ops.exec(s))) {
      if (o[1] !== undefined) {
        o[1].replace(/\(((?:\\.|[^\\)])*)\)|(-?\d+\.?\d*)/g, (_, t, n) => { if (t !== undefined) line += lit(t); else if (+n < -200) line += " "; });
      } else if (o[2] !== undefined) line += lit(o[2]);
      else if (line) { out.push(line); line = ""; }
    }
    if (line) out.push(line);
  }
  return out.join("\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// ================= image generation (ComfyUI + SDXL) =================
const COMFY_DIR = process.env.COMFY_DIR || path.join(__dirname, "image-engine", "ComfyUI_windows_portable");
const COMFY_PORT = +process.env.COMFY_PORT || 8188;
const COMFY = `http://127.0.0.1:${COMFY_PORT}`;
const CKPT = "sd_xl_base_1.0.safetensors";
const IMG_DIR = path.join(DATA_DIR, "images");
const DEFAULT_NEG = "blurry, low quality, lowres, jpeg artifacts, watermark, signature, text, deformed, extra fingers, bad anatomy";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let comfyProc = null, comfyStarting = null, comfyHasModel = false;

const comfyPython = () => path.join(COMFY_DIR, "python_embeded", "python.exe");
const imageReady = () => fs.existsSync(comfyPython()) && fs.existsSync(path.join(COMFY_DIR, "ComfyUI", "models", "checkpoints", CKPT));
async function comfyUp() {
  try { return (await fetch(COMFY + "/system_stats", { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
function startComfy() {
  if (comfyStarting) return comfyStarting;
  comfyStarting = (async () => {
    if (await comfyUp()) return;
    if (!imageReady()) throw new Error("The image engine isn't installed yet.");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const log = fs.openSync(path.join(DATA_DIR, "image-engine.log"), "a");
    comfyProc = spawn(comfyPython(), ["-s", path.join("ComfyUI", "main.py"), "--windows-standalone-build",
      "--listen", "127.0.0.1", "--port", String(COMFY_PORT), "--disable-auto-launch"],
      { cwd: COMFY_DIR, windowsHide: true, stdio: ["ignore", log, log] });
    comfyProc.on("exit", () => { comfyProc = null; comfyStarting = null; comfyHasModel = false; });
    for (let i = 0; i < 360; i++) {
      if (await comfyUp()) return;
      if (!comfyProc) throw new Error("The image engine stopped while starting. Details are in data\\image-engine.log");
      await sleep(500);
    }
    throw new Error("The image engine took too long to start. Details are in data\\image-engine.log");
  })();
  comfyStarting.catch(() => { comfyStarting = null; });
  return comfyStarting;
}
// Chat and images share the graphics card: each side gives memory back before the other starts.
async function unloadOllama() {
  try {
    const ps = await (await fetch(OLLAMA + "/api/ps")).json();
    for (const m of ps.models || [])
      await fetch(OLLAMA + "/api/generate", { method: "POST", body: JSON.stringify({ model: m.name, keep_alive: 0 }) });
  } catch {}
}
async function freeComfy() {
  if (!comfyHasModel) return;
  comfyHasModel = false;
  const vram = async () => {
    try { const d = (await (await fetch(COMFY + "/system_stats", { signal: AbortSignal.timeout(1500) })).json()).devices?.[0]; return d ? { free: d.vram_free, total: d.vram_total } : null; }
    catch { return null; }
  };
  try {
    const before = await vram();
    await fetch(COMFY + "/free", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
    // The image engine frees memory a moment after it's asked to. Wait until the card shows it, so Ollama
    // doesn't try to load the chat model into memory that's still taken (that fails with "out of memory").
    for (let i = 0; i < 40 && before; i++) {
      await sleep(250);
      const now = await vram();
      if (!now || now.free >= now.total * 0.6 || now.free > before.free + 2 * 1024 ** 3) break;
    }
  } catch {}
}
const clampInt = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
const MODELS_DIR = path.join(COMFY_DIR, "ComfyUI", "models");
const LIGHTNING = "sdxl_lightning_4step_lora.safetensors";
const CANNY_CN = "controlnet-canny-sdxl-small.fp16.safetensors";
const UPSCALER = "RealESRGAN_x4plus.pth";
const hasModel = (folder, file) => fs.existsSync(path.join(MODELS_DIR, folder, file));
const imageExtras = () => ({
  fast: hasModel("loras", LIGHTNING),
  outline: hasModel("controlnet", CANNY_CN),
  upscale: hasModel("upscale_models", UPSCALER),
  style: hasModel("ipadapter", "ip-adapter_sdxl_vit-h.safetensors") && hasModel("clip_vision", "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors")
    && fs.existsSync(path.join(COMFY_DIR, "ComfyUI", "custom_nodes", "ComfyUI_IPAdapter_plus")),
});

// Text-to-picture, optionally fast (SDXL-Lightning), guided by a reference picture's style (IP-Adapter)
// and/or its outlines (ControlNet canny). o.refImage is a file name already uploaded to the image engine.
function workflow(o) {
  const seed = Number.isSafeInteger(o.seed) && o.seed >= 0 ? o.seed : crypto.randomInt(0, 2 ** 47);
  const ex = imageExtras();
  const wf = {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CKPT } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: clampInt(o.width, 512, 1536, 1024), height: clampInt(o.height, 512, 1536, 1024), batch_size: 1 } },
  };
  let model = ["4", 0], clip = ["4", 1];
  let steps = clampInt(o.steps, 5, 60, 25), cfg = Math.min(15, Math.max(1, +o.cfg || 7)), sampler = "dpmpp_2m", scheduler = "karras";
  if (o.fast && ex.fast) {
    wf["10"] = { class_type: "LoraLoader", inputs: { model, clip, lora_name: LIGHTNING, strength_model: 1, strength_clip: 1 } };
    model = ["10", 0]; clip = ["10", 1];
    steps = 4; cfg = 1; sampler = "euler"; scheduler = "sgm_uniform";
  }
  if (o.refImage) wf["20"] = { class_type: "LoadImage", inputs: { image: o.refImage } };
  if (o.refImage && /style|both/.test(o.refMode || "style") && ex.style) {
    wf["21"] = { class_type: "IPAdapterUnifiedLoader", inputs: { model, preset: "STANDARD (medium strength)" } };
    wf["22"] = { class_type: "IPAdapter", inputs: { model: ["21", 0], ipadapter: ["21", 1], image: ["20", 0], weight: Math.min(1.5, Math.max(0.1, +o.refStrength || 0.8)), start_at: 0, end_at: 1, weight_type: "standard" } };
    model = ["22", 0];
  }
  wf["6"] = { class_type: "CLIPTextEncode", inputs: { text: String(o.prompt || "").slice(0, 4000), clip } };
  wf["7"] = { class_type: "CLIPTextEncode", inputs: { text: String(o.negative || DEFAULT_NEG).slice(0, 2000), clip } };
  let positive = ["6", 0], negative = ["7", 0];
  if (o.refImage && /outline|both/.test(o.refMode || "") && ex.outline) {
    wf["30"] = { class_type: "Canny", inputs: { image: ["20", 0], low_threshold: 0.4, high_threshold: 0.8 } };
    wf["31"] = { class_type: "ControlNetLoader", inputs: { control_net_name: CANNY_CN } };
    wf["32"] = { class_type: "ControlNetApplyAdvanced", inputs: { positive, negative, control_net: ["31", 0], image: ["30", 0], strength: 0.75, start_percent: 0, end_percent: 0.8, vae: ["4", 2] } };
    positive = ["32", 0]; negative = ["32", 1];
  }
  wf["3"] = { class_type: "KSampler", inputs: { seed, steps, cfg, sampler_name: sampler, scheduler, denoise: 1, model, positive, negative, latent_image: ["5", 0] } };
  wf["8"] = { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } };
  wf["9"] = { class_type: "SaveImage", inputs: { filename_prefix: "localchat", images: ["8", 0] } };
  return wf;
}
// Upscale a saved picture 4× with Real-ESRGAN, then scale to 2× (sharp, and a manageable file size).
const upscaleWorkflow = (image) => ({
  "1": { class_type: "LoadImage", inputs: { image } },
  "2": { class_type: "UpscaleModelLoader", inputs: { model_name: UPSCALER } },
  "3": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
  "4": { class_type: "ImageScaleBy", inputs: { image: ["3", 0], upscale_method: "lanczos", scale_by: 0.5 } },
  "9": { class_type: "SaveImage", inputs: { filename_prefix: "localchat_up", images: ["4", 0] } },
});
async function comfyUpload(buf, name) {
  const form = new FormData();
  form.append("image", new Blob([buf]), name);
  form.append("overwrite", "true");
  const r = await fetch(COMFY + "/upload/image", { method: "POST", body: form });
  if (!r.ok) throw new Error("Couldn't hand the reference picture to the image engine");
  return (await r.json()).name;
}
const NODE_MSG = { "4": "Loading the image model…", "10": "Loading fast mode…", "21": "Studying the reference picture's style…", "30": "Tracing the reference picture's outlines…",
  "6": "Reading the prompt…", "7": "Reading the prompt…", "3": "Drawing…", "8": "Finishing the image…", "9": "Saving…", "2": "Loading the upscaler…", "1": "Loading the picture…" };

async function handleImage(req, res) {
  const opts = JSON.parse((await readBody(req, 20e6)).toString("utf8") || "{}");
  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
  const send = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + "\n"); };
  const job = { cancel: null };
  res.on("close", () => { if (!res.writableEnded) job.cancel?.(); });
  await generateImage(opts, send, job);
  res.end();
}

// Hard rule for pictures, not a setting: never generate sexual imagery involving minors.
// Checked here on the server so it covers the 🖼 button, agents, and AI-written prompts alike.
const MINOR_WORDS = /\b(child|children|childlike|kid|kids|minor|minors|underage|under-age|preteen|pre-teen|tween|toddler|infant|bab(y|ies)|little (girl|boy)s?|young (girl|boy)s?|schoolgirls?|schoolboys?|teen|teens|teenager|teenagers|teenage|loli|lolita|shota|jailbait|elementary school|middle school|grade schooler)\b/i;
const SEXUAL_WORDS = /\b(nude|nudes|naked|nudity|nsfw|sex|sexual|sexualized|sexy|porn|porno|pornographic|erotic|erotica|explicit|topless|bottomless|lingerie|undress(ed|ing)?|strip(ping|ped)?|genitals?|breasts?|nipples?|lewd|hentai|orgasm|seductive|provocative|intercourse|aroused|fetish)\b/i;
function minorSexualContent(text) {
  const t = String(text || "");
  const youngAge = [...t.matchAll(/\b(\d{1,2})\s*[- ]?\s*(yo|y\/o|years?[- ]old|yrs?[- ]old)\b/gi)].some((m) => +m[1] < 18);
  return (MINOR_WORDS.test(t) || youngAge) && SEXUAL_WORDS.test(t);
}

// Draws one picture, reporting progress through send(); used by the 🖼 button and by agents.
async function generateImage(opts, send, job = {}) {
  if (opts.kind !== "upscale" && minorSexualContent(opts.prompt)) {
    log("warn", "blocked a picture request that combined minors with sexual content");
    return send({ stage: "error", error: `This picture request was blocked. ${APP_NAME} never creates sexual images involving minors.` });
  }
  let ws = null, promptId = null;
  job.cancel = () => { ws?.close(); if (promptId) fetch(COMFY + "/interrupt", { method: "POST" }).catch(() => {}); };
  try {
    if (!(await comfyUp())) {
      send({ stage: "starting", message: "Starting the image engine (about 30 seconds the first time)…" });
      await startComfy();
    }
    send({ stage: "freeing", message: "Freeing graphics memory from the chat model…" });
    await unloadOllama();
    const clientId = crypto.randomUUID();
    ws = new WebSocket(`ws://127.0.0.1:${COMFY_PORT}/ws?clientId=${clientId}`);
    await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error("Couldn't connect to the image engine")); });
    let wf;
    if (opts.kind === "upscale") {
      const src = path.join(IMG_DIR, path.basename(String(opts.image || "")));
      if (!/^[\w-]+\.png$/.test(path.basename(src)) || !fs.existsSync(src)) throw new Error("That picture wasn't found.");
      wf = upscaleWorkflow(await comfyUpload(fs.readFileSync(src), "lc_up_" + path.basename(src)));
    } else {
      if (opts.refImageB64) opts.refImage = await comfyUpload(Buffer.from(opts.refImageB64, "base64"), `lc_ref_${Date.now()}.jpg`);
      wf = workflow(opts);
    }
    const r = await fetch(COMFY + "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wf, client_id: clientId }) });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error?.message || JSON.stringify(d.node_errors || d).slice(0, 300));
    promptId = d.prompt_id;
    send({ stage: "queued", message: "Queued…", seed: wf["3"].inputs.seed });
    const images = await new Promise((ok, bad) => {
      const out = [];
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return; // live preview frames
        const m = JSON.parse(ev.data), dd = m.data || {};
        if (dd.prompt_id && dd.prompt_id !== promptId) return;
        if (m.type === "executing" && dd.node && NODE_MSG[dd.node]) send({ stage: "working", message: NODE_MSG[dd.node] });
        else if (m.type === "progress") send({ stage: "drawing", value: dd.value, max: dd.max });
        else if (m.type === "executed" && dd.output?.images) out.push(...dd.output.images);
        else if (m.type === "execution_error") bad(new Error(dd.exception_message?.trim() || "The image engine hit an error"));
        else if (m.type === "execution_interrupted") bad(new Error("Stopped"));
        else if (m.type === "execution_success" || (m.type === "executing" && dd.node === null)) ok(out);
      };
      ws.onclose = () => bad(new Error("Lost the connection to the image engine"));
    });
    comfyHasModel = true;
    if (!images.length) throw new Error("The image engine finished without producing an image");
    fs.mkdirSync(IMG_DIR, { recursive: true });
    const saved = [];
    for (const im of images) {
      const q = new URLSearchParams({ filename: im.filename, subfolder: im.subfolder || "", type: im.type || "output" });
      const buf = Buffer.from(await (await fetch(COMFY + "/view?" + q)).arrayBuffer());
      const name = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}.png`;
      fs.writeFileSync(path.join(IMG_DIR, name), buf);
      saved.push(name);
    }
    send({ stage: "done", images: saved, seed: wf["3"].inputs.seed });
  } catch (e) {
    send({ stage: "error", error: e.message });
  } finally {
    ws?.close();
  }
}
// ================= agent tools =================
// Everything agents touch on disk is confined to LocalChat\workspace.
const dns = require("dns").promises;
const net = require("net");
const WS = process.env.LC_WORKSPACE || path.join(__dirname, "workspace");
fs.mkdirSync(WS, { recursive: true });
const WS_REAL = fs.realpathSync(WS);

function wsPath(p = ".") {
  const rel = String(p || ".").replace(/^([a-zA-Z]:)?[/\\]+/, "").replace(/^workspace[/\\]/i, "");
  const full = path.resolve(WS, rel);
  const inside = (f, root) => f === root || f.startsWith(root + path.sep);
  if (!inside(full, WS)) throw new Error("Agents can only use files inside the workspace folder.");
  // Also resolve links, so a shortcut inside the workspace can't point outside it.
  let real = full;
  try { real = fs.realpathSync(full); } catch { try { real = path.join(fs.realpathSync(path.dirname(full)), path.basename(full)); } catch {} }
  if (!inside(real, WS_REAL) && !inside(real, WS)) throw new Error("Agents can only use files inside the workspace folder.");
  return full;
}
const relWs = (full) => path.relative(WS, full).split(path.sep).join("/") || ".";
const clipText = (s, n) => (s.length > n ? s.slice(0, n) + `\n[...cut off, ${s.length - n} more characters]` : s);

function findPython() {
  const cands = [];
  const lad = process.env.LOCALAPPDATA || "";
  try { for (const d of fs.readdirSync(path.join(lad, "Programs", "Python"))) cands.push(path.join(lad, "Programs", "Python", d, "python.exe")); } catch {}
  cands.sort().reverse();
  cands.push(comfyPython());
  return cands.find((c) => fs.existsSync(c)) || "python";
}
const PYTHON = findPython();

function runCode({ language, code, timeout }) {
  return new Promise((resolve) => {
    const lang = /^(js|javascript|node)$/i.test(language || "") ? "javascript" : "python";
    if (!code || !String(code).trim()) return resolve({ error: "No code was given." });
    const tmpDir = path.join(WS, ".runs");
    fs.mkdirSync(tmpDir, { recursive: true });
    const file = path.join(tmpDir, `run_${Date.now()}_${crypto.randomBytes(2).toString("hex")}.${lang === "python" ? "py" : "mjs"}`);
    fs.writeFileSync(file, String(code));
    const ms = Math.min(120, Math.max(5, +timeout || 60)) * 1000;
    const child = spawn(lang === "python" ? PYTHON : process.execPath, [file], {
      cwd: WS, windowsHide: true, timeout: ms, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { if (out.length < 40000) out += d; });
    child.stderr.on("data", (d) => { if (err.length < 40000) err += d; });
    const t0 = Date.now();
    child.on("error", (e) => resolve({ error: e.message }));
    child.on("close", (codeNum, signal) => {
      try { fs.unlinkSync(file); } catch {}
      resolve({ language: lang, exit_code: codeNum, timed_out: !!signal && Date.now() - t0 >= ms - 100,
        stdout: clipText(out, 12000), stderr: clipText(err, 6000), seconds: +((Date.now() - t0) / 1000).toFixed(2) });
    });
  });
}

// Web access: never let agents reach this PC or the home network (Ollama, the image engine, router pages…).
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}
async function safeFetch(url, opts = {}, hops = 0) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https pages can be read.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Agents can't open addresses on this PC or the local network.");
  const r = await fetch(u, { ...opts, redirect: "manual", signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LocalChat/1.0", "accept-language": "en-US,en;q=0.8", ...(opts.headers || {}) } });
  if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
    if (hops >= 5) throw new Error("Too many redirects.");
    return safeFetch(new URL(r.headers.get("location"), u).href, opts, hops + 1);
  }
  return r;
}
const decodeEntities = (s) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k[0] === "#") return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[k] ?? m;
});
function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  // Prefer the page's main content over menus and sidebars.
  const main = html.match(/<main[\s>][\s\S]*?<\/main>/i)?.[0] || html.match(/<article[\s>][\s\S]*?<\/article>/i)?.[0]
    || html.match(/<div[^>]+id="(?:mw-content-text|content|main-content|main)"[\s\S]*$/i)?.[0] || html;
  let body = main.replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ").replace(/<h([1-6])[^>]*>/gi, "\n\n## ").replace(/<[^>]+>/g, " ");
  body = decodeEntities(body).replace(/[ \t\f\v\r]+/g, " ").replace(/^ +| +$/gm, "").replace(/^•\s*$/gm, "")
    .replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  return { title: decodeEntities(title.trim()).replace(/\s+/g, " "), text: body };
}
async function readWebpage({ url }) {
  if (!url) return { error: "No url was given." };
  const r = await safeFetch(url);
  const type = r.headers.get("content-type") || "";
  if (!/text\/|json|xml/.test(type)) return { url, error: `That page is ${type || "not text"}, which can't be read as text.` };
  const raw = (await r.text()).slice(0, 3_000_000);
  const { title, text } = /html/.test(type) ? htmlToText(raw) : { title: "", text: raw };
  return { url: r.url || url, status: r.status, title, text: clipText(text, 12000) };
}
async function webSearch({ query }, cfg = {}) {
  if (!query) return { error: "No query was given." };
  const results = [];
  const notes = [];
  if (cfg.engine !== "basic" && searxInstalled()) {
    try {
      await startSearx();
      const r = await fetch(`${SEARX}/search?format=json&q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(25000) });
      const j = await r.json();
      for (const x of (j.results || []).slice(0, 10))
        results.push({ source: "SearXNG (" + (x.engines || [x.engine]).join(", ") + ")", title: x.title, url: x.url, snippet: (x.content || "").slice(0, 400) });
      for (const a of (j.answers || []).slice(0, 2)) results.unshift({ source: "SearXNG answer", title: "Answer", url: a.url || "", snippet: String(a.answer || a) });
      if (results.length) return { query, results, notes };
      notes.push("SearXNG found nothing; trying the basic sources.");
    } catch (e) { notes.push("SearXNG failed (" + e.message + "); using the basic sources."); }
  }
  if (cfg.braveKey) {
    try {
      const r = await fetch("https://api.search.brave.com/res/v1/web/search?count=8&q=" + encodeURIComponent(query),
        { headers: { accept: "application/json", "x-subscription-token": cfg.braveKey }, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.detail || `status ${r.status}`);
      for (const w of j.web?.results || []) results.push({ source: "Brave", title: w.title, url: w.url, snippet: (w.description || "").replace(/<[^>]+>/g, "") });
    } catch (e) { notes.push("Brave Search failed: " + e.message); }
  }
  try {
    const r = await fetch("https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=" + encodeURIComponent(query),
      { headers: { "user-agent": "LocalChat/1.0" }, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (j.AbstractText) results.push({ source: "DuckDuckGo instant answer (" + (j.AbstractSource || "summary") + ")", title: j.Heading, url: j.AbstractURL, snippet: j.AbstractText });
    if (j.Answer) results.push({ source: "DuckDuckGo instant answer", title: "Answer", url: "", snippet: String(j.Answer) });
    for (const t of (j.RelatedTopics || []).flatMap((t) => t.Topics || [t]).slice(0, 4))
      if (t.Text && t.FirstURL) results.push({ source: "DuckDuckGo related", title: t.Text.split(" - ")[0], url: t.FirstURL, snippet: t.Text });
  } catch (e) { notes.push("DuckDuckGo failed: " + e.message); }
  if (cfg.wikipedia !== false) {
    try {
      const r = await fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=6&srsearch=" + encodeURIComponent(query),
        { headers: { "user-agent": "LocalChat/1.0 (personal desktop app)" }, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      for (const s of j.query?.search || [])
        results.push({ source: "Wikipedia", title: s.title, url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(s.title.replace(/ /g, "_")), snippet: decodeEntities(s.snippet.replace(/<[^>]+>/g, "")) });
    } catch (e) { notes.push("Wikipedia failed: " + e.message); }
  }
  if (!results.length) notes.push(cfg.braveKey ? "No results." : "No results. Without a Brave Search key, search covers DuckDuckGo instant answers and Wikipedia only, so try a shorter, encyclopedia-style query or read a specific page.");
  return { query, results: results.slice(0, 12), notes };
}

async function listFiles({ path: p }) {
  const dir = wsPath(p);
  if (!fs.existsSync(dir)) return { error: `No folder called ${relWs(dir)}.` };
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith(".runs"))
    .map((e) => { const s = fs.statSync(path.join(dir, e.name)); return { name: e.name + (e.isDirectory() ? "/" : ""), size: e.isDirectory() ? null : s.size, modified: s.mtime.toISOString().slice(0, 16) }; });
  return { folder: relWs(dir), entries };
}
function readFile({ path: p }) {
  const f = wsPath(p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return { error: `No file called ${relWs(f)}.` };
  const buf = fs.readFileSync(f);
  if (buf.subarray(0, 8000).includes(0)) return { path: relWs(f), size: buf.length, error: "That's a binary file, not text." };
  return { path: relWs(f), size: buf.length, content: clipText(buf.toString("utf8"), 30000) };
}
function writeFile({ path: p, content }) {
  const f = wsPath(p);
  if (f === WS) return { error: "Give a file name." };
  const existed = fs.existsSync(f);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, String(content ?? ""));
  return { path: relWs(f), bytes: Buffer.byteLength(String(content ?? "")), overwritten: existed };
}
function deleteFile({ path: p }) {
  const f = wsPath(p);
  if (f === WS) return { error: "The workspace folder itself can't be deleted." };
  if (!fs.existsSync(f)) return { error: `No file called ${relWs(f)}.` };
  fs.rmSync(f, { recursive: true, force: true });
  return { deleted: relWs(f) };
}
async function makePicture({ prompt, negative, width, height }, cfg = {}) {
  if (!prompt) return { error: "No prompt was given." };
  if (!imageReady()) return { error: "The image engine isn't installed." };
  let last = null;
  await generateImage({ prompt, negative, width: width || 1024, height: height || 1024, steps: 25, fast: !!cfg.fastPictures }, (o) => { last = o; });
  if (last?.stage !== "done") throw new Error(last?.error || "The picture wasn't made.");
  return { picture: last.images[0], url: "/images/" + last.images[0], prompt };
}

// ================= private web search (SearXNG) =================
const SEARX_DIR = path.join(__dirname, "search-engine");
const SEARX_PORT = 8888;
const SEARX = `http://127.0.0.1:${SEARX_PORT}`;
const searxPython = path.join(SEARX_DIR, "venv", "Scripts", "python.exe");
const searxInstalled = () => fs.existsSync(searxPython) && fs.existsSync(path.join(SEARX_DIR, "searxng", "searx", "webapp.py"));
let searxProc = null, searxStarting = null;
async function searxUp() { try { return (await fetch(SEARX + "/healthz", { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } }
function startSearx() {
  if (searxStarting) return searxStarting;
  searxStarting = (async () => {
    if (await searxUp()) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const log = fs.openSync(path.join(DATA_DIR, "search-engine.log"), "a");
    searxProc = spawn(searxPython, ["-m", "searx.webapp"], { cwd: path.join(SEARX_DIR, "searxng"), windowsHide: true, stdio: ["ignore", log, log],
      env: { ...process.env, SEARXNG_SETTINGS_PATH: path.join(SEARX_DIR, "settings.yml") } });
    searxProc.on("exit", () => { searxProc = null; searxStarting = null; });
    for (let i = 0; i < 120; i++) { if (await searxUp()) return; if (!searxProc) throw new Error("the search engine stopped while starting"); await sleep(500); }
    throw new Error("the search engine took too long to start");
  })();
  searxStarting.catch(() => { searxStarting = null; });
  return searxStarting;
}

// ================= real browser for agents (Playwright driving Edge) =================
const hostChecks = new Map();
async function isPrivateHost(host) {
  host = host.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (net.isIP(host)) return isPrivateIp(host);
  const hit = hostChecks.get(host);
  if (hit && Date.now() - hit.t < 60000) return hit.v;
  let v = true;
  try { const addrs = await dns.lookup(host, { all: true }); v = !addrs.length || addrs.some((a) => isPrivateIp(a.address)); } catch {}
  hostChecks.set(host, { v, t: Date.now() });
  return v;
}
let browser = null, browserServer = null, browserIdle = null;
async function withPage(url, fn) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https pages can be opened.");
  if (await isPrivateHost(u.hostname)) throw new Error("Agents can't open addresses on this PC or the local network.");
  if (!browser?.isConnected()) {
    const { chromium } = require("playwright-core");
    browserServer = await chromium.launchServer({ channel: "msedge", headless: true });
    browser = await chromium.connect(browserServer.wsEndpoint());
  }
  clearTimeout(browserIdle);
  // A fresh, empty profile each time: no access to your Edge logins, cookies or history.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: false, serviceWorkers: "block", locale: "en-US" });
  await ctx.route("**/*", async (route) => {
    try {
      const ru = new URL(route.request().url());
      if (/^https?:$/.test(ru.protocol) && (await isPrivateHost(ru.hostname))) return route.abort();
      if (!/^(https?|data|blob):$/.test(ru.protocol)) return route.abort();
      return route.continue();
    } catch { return route.abort(); }
  });
  const page = await ctx.newPage();
  try {
    await page.goto(u.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {});
    return await fn(page);
  } finally {
    await ctx.close().catch(() => {});
    browserIdle = setTimeout(() => { browser?.close().catch(() => {}); browserServer?.close().catch(() => {}); browser = browserServer = null; }, 5 * 60 * 1000);
  }
}
const browsePage = ({ url }) => !url ? { error: "No url was given." } : withPage(url, async (page) => {
  const text = await page.evaluate(() => (document.querySelector("main, article, [role=main]") || document.body)?.innerText || "");
  const links = await page.$$eval("a[href]", (as) => as.slice(0, 600).map((a) => ({ text: a.innerText.trim().replace(/\s+/g, " ").slice(0, 90), url: a.href })));
  return { url: page.url(), title: await page.title(), text: clipText(text.replace(/\n{3,}/g, "\n\n").trim(), 12000),
    links: links.filter((l) => l.text && /^https?:/.test(l.url)).slice(0, 40) };
});
const screenshotPage = ({ url, path: p, full_page }) => !url ? { error: "No url was given." } : withPage(url, async (page) => {
  const file = wsPath(p || `screenshots/page_${Date.now()}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: !!full_page });
  return { path: relWs(file), url: page.url(), title: await page.title() };
});

// ================= document library (embeddings with nomic-embed-text via Ollama) =================
const LIB = path.join(DATA_DIR, "library.json");
const EMBED_MODEL = "nomic-embed-text";
let library = null;
const loadLib = () => (library ??= fs.existsSync(LIB) ? JSON.parse(fs.readFileSync(LIB, "utf8")) : { docs: [] });
const saveLib = () => { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(LIB + ".tmp", JSON.stringify(library)); fs.renameSync(LIB + ".tmp", LIB); };
async function embed(texts) {
  const r = await fetch(OLLAMA + "/api/embed", { method: "POST", body: JSON.stringify({ model: EMBED_MODEL, input: texts }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "Embedding failed. Is nomic-embed-text installed?");
  return j.embeddings.map((v) => { const n = Math.hypot(...v) || 1; return v.map((x) => Math.round((x / n) * 1e5) / 1e5); });
}
function chunkText(text, size = 1000, overlap = 150) {
  const paras = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) { chunks.push(cur); cur = cur.slice(-overlap) + "\n\n" + p; }
    else cur = cur ? cur + "\n\n" + p : p;
    while (cur.length > size * 1.5) { chunks.push(cur.slice(0, size)); cur = cur.slice(size - overlap); }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}
async function libraryAdd({ name, text }) {
  if (!text?.trim()) return { error: "That document has no text." };
  const chunks = chunkText(text);
  const vecs = [];
  for (let i = 0; i < chunks.length; i += 16) vecs.push(...(await embed(chunks.slice(i, i + 16).map((c) => "search_document: " + c))));
  const doc = { id: "d" + Date.now() + crypto.randomBytes(2).toString("hex"), name: String(name || "Untitled").slice(0, 200), added: new Date().toISOString(), chars: text.length,
    chunks: chunks.map((t, i) => ({ text: t, vec: vecs[i] })) };
  loadLib().docs.push(doc);
  saveLib();
  return { id: doc.id, name: doc.name, chunks: chunks.length };
}
async function searchLibrary({ query, k = 5 }) {
  const docs = loadLib().docs;
  if (!docs.length) return { query, results: [], note: "The library is empty. Add documents in Settings → Library." };
  if (!query) return { error: "No query was given." };
  const [q] = await embed(["search_query: " + query]);
  const scored = [];
  for (const d of docs) for (const c of d.chunks) scored.push({ doc: d.name, score: c.vec.reduce((s, x, i) => s + x * q[i], 0), text: c.text });
  scored.sort((a, b) => b.score - a.score);
  return { query, results: scored.slice(0, Math.min(10, +k || 5)).map((s) => ({ document: s.doc, relevance: +s.score.toFixed(3), text: s.text })) };
}

// ================= private voice (whisper.cpp speech-to-text, Piper text-to-speech) =================
const VOICE = path.join(__dirname, "voice");
const findExe = (dir, name) => {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === name) return f;
    if (e.isDirectory()) { const hit = findExe(f, name); if (hit) return hit; }
  }
  return null;
};
const voiceTools = () => ({
  whisper: findExe(path.join(VOICE, "whisper"), "whisper-cli.exe"),
  whisperModel: path.join(VOICE, "whisper", "ggml-base.en.bin"),
  piper: findExe(path.join(VOICE, "piper"), "piper.exe"),
  piperVoice: path.join(VOICE, "piper-voices", "en_US-lessac-medium.onnx"),
});
const voiceStatus = () => { const v = voiceTools(); return { stt: !!v.whisper && fs.existsSync(v.whisperModel), tts: !!v.piper && fs.existsSync(v.piperVoice) }; };
const runProc = (exe, args, input) => new Promise((ok, bad) => {
  const p = spawn(exe, args, { windowsHide: true, timeout: 120000 });
  let out = "", err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  p.on("error", bad);
  p.on("close", (code) => (code === 0 ? ok(out) : bad(new Error(err.split("\n").filter(Boolean).slice(-2).join(" ") || `exit code ${code}`))));
  if (input != null) { p.stdin.write(input); p.stdin.end(); }
});
async function transcribe(wav) {
  const v = voiceTools();
  if (!voiceStatus().stt) throw new Error("Private voice typing isn't installed.");
  const tmp = path.join(DATA_DIR, `rec_${Date.now()}.wav`);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(tmp, wav);
  try {
    const out = await runProc(v.whisper, ["-m", v.whisperModel, "-f", tmp, "-nt", "-np", "-l", "en", "-t", "4"]);
    return out.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  } finally { fs.rmSync(tmp, { force: true }); }
}
async function speakText(text) {
  const v = voiceTools();
  if (!voiceStatus().tts) throw new Error("Private read-aloud isn't installed.");
  const tmp = path.join(DATA_DIR, `tts_${Date.now()}.wav`);
  try {
    await runProc(v.piper, ["--model", v.piperVoice, "--output_file", tmp], String(text).slice(0, 8000));
    return fs.readFileSync(tmp);
  } finally { fs.rmSync(tmp, { force: true }); }
}

// ================= OCR (tesseract.js, runs on this PC) =================
let ocrWorker = null;
async function ocrImage(buf) {
  if (!ocrWorker) {
    const { createWorker } = require("tesseract.js");
    ocrWorker = await createWorker("eng", 1, { langPath: path.join(__dirname, "vendor", "tessdata"), cachePath: path.join(DATA_DIR, "ocr-cache"), gzip: true });
  }
  const { data } = await ocrWorker.recognize(buf);
  return data.text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
// Scanned PDFs are usually one JPEG per page: pull those out so they can be read with OCR.
function pdfJpegs(buf, max = 20) {
  const src = buf.toString("latin1"), out = [];
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(src)) && out.length < max) {
    if (!/\/Subtype\s*\/Image/.test(m[1]) || !/DCTDecode/.test(m[1])) continue;
    const start = m.index + m[0].length, end = src.indexOf("endstream", start);
    if (end > start) out.push(buf.subarray(start, end));
  }
  return out;
}
const readImageText = async ({ path: p }) => {
  const f = wsPath(p);
  if (!fs.existsSync(f)) return { error: `No file called ${relWs(f)}.` };
  return { path: relWs(f), text: clipText(await ocrImage(fs.readFileSync(f)), 12000) };
};

// ================= MCP client (Model Context Protocol tool servers) =================
const MCP_CFG = path.join(DATA_DIR, "mcp.json");
const MCP_PRESETS = {
  filesystem: { label: "Workspace files (official reference server)", command: "npx", args: ["@modelcontextprotocol/server-filesystem", WS], enabled: false },
  memory: { label: "Knowledge-graph memory", command: "npx", args: ["@modelcontextprotocol/server-memory"], env: { MEMORY_FILE_PATH: path.join(DATA_DIR, "mcp-memory.json") }, enabled: false },
  "sequential-thinking": { label: "Step-by-step thinking helper", command: "npx", args: ["@modelcontextprotocol/server-sequential-thinking"], enabled: false, trusted: true },
};
const mcp = { clients: {}, status: {} };
const loadMcpCfg = () => { try { return JSON.parse(fs.readFileSync(MCP_CFG, "utf8")); } catch { return { servers: structuredClone(MCP_PRESETS) }; } };
const mcpSafeName = (s) => String(s).replace(/[^\w-]/g, "_").slice(0, 40);
async function mcpConnect(name, cfg) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  let command = cfg.command, args = cfg.args || [];
  if (command === "npx") {   // run npx through node directly: .cmd files can't be spawned safely without a shell
    command = process.execPath;
    args = [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), "-y", ...args];
  }
  const transport = new StdioClientTransport({ command, args, cwd: WS, env: { ...process.env, ...(cfg.env || {}) }, stderr: "ignore" });
  const client = new Client({ name: "local-chat", version: "1.0.0" });
  await Promise.race([client.connect(transport), sleep(120000).then(() => { throw new Error("timed out starting (first start downloads the server)"); })]);
  const { tools } = await client.listTools();
  mcp.clients[name] = { client, transport };
  mcp.status[name] = { connected: true, trusted: !!cfg.trusted, tools: tools.map((t) => ({ name: t.name, description: (t.description || "").slice(0, 600), inputSchema: t.inputSchema || {} })) };
}
async function mcpReload() {
  for (const [n, c] of Object.entries(mcp.clients)) { try { await c.client.close(); } catch {} delete mcp.clients[n]; }
  mcp.status = {};
  const cfg = loadMcpCfg();
  await Promise.all(Object.entries(cfg.servers || {}).filter(([, s]) => s.enabled).map(async ([name, s]) => {
    const key = mcpSafeName(name);
    mcp.status[key] = { connecting: true };
    try { await mcpConnect(key, s); } catch (e) { mcp.status[key] = { connected: false, error: e.message }; }
  }));
}
async function mcpCall({ server, tool, args }) {
  const c = mcp.clients[server];
  if (!c) return { error: `The MCP server "${server}" isn't connected.` };
  const r = await c.client.callTool({ name: tool, arguments: args || {} });
  const text = (r.content || []).map((x) => (x.type === "text" ? x.text : `[${x.type} content]`)).join("\n");
  return { server, tool, isError: !!r.isError, result: clipText(text, 12000) };
}

// Helpers for sandboxed code: copy workspace files in, and write the files it produced back out.
function snapshotWorkspace() {
  const files = [];
  let total = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else { const s = fs.statSync(f).size; if (s <= 5e6 && total + s <= 40e6) { total += s; files.push({ path: relWs(f), b64: fs.readFileSync(f).toString("base64") }); } }
    }
  };
  walk(WS);
  return { files };
}
function writeFileB64({ path: p, b64 }) {
  const f = wsPath(p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const existed = fs.existsSync(f);
  fs.writeFileSync(f, Buffer.from(String(b64 || ""), "base64"));
  return { path: relWs(f), overwritten: existed };
}

const TOOLS = {
  browse_page: browsePage,
  screenshot_page: screenshotPage,
  search_library: searchLibrary,
  read_image_text: readImageText,
  snapshot_workspace: snapshotWorkspace,
  write_file_b64: writeFileB64,
  mcp_call: mcpCall,
  list_files: listFiles,
  read_file: readFile,
  write_file: writeFile,
  delete_file: deleteFile,
  file_exists: ({ path: p }) => { const f = wsPath(p); return { path: relWs(f), exists: fs.existsSync(f) }; },
  run_code: runCode,
  web_search: webSearch,
  read_webpage: readWebpage,
  make_picture: makePicture,
};

// Stop the image engine with the server when it shuts down normally.
// taskkill /T also ends child processes (a Python venv launcher starts the real interpreter as a child).
const killTree = (p) => { if (p?.pid) try { require("child_process").spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }); } catch {} };
process.on("exit", () => {
  killTree(comfyProc);
  killTree(searxProc);
  killTree(browserServer?.process());
  for (const c of Object.values(mcp.clients)) killTree(c.transport?._process);
});
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sig, () => process.exit(0));

function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

// A secret the page gets when it loads. Private endpoints require it, so code running in the
// sandbox (which can't see it) can't reach your chats, the tools, or Ollama.
const UI_TOKEN = crypto.randomBytes(24).toString("hex");
// The desktop launcher reads this file to ask the server to shut down cleanly (stopping everything it started).
const SHUTDOWN_KEY = crypto.randomBytes(24).toString("hex");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, `.shutdown-key-${PORT}`), SHUTDOWN_KEY);
const PUBLIC = /^\/($|index\.html$|icon\.png$|manifest\.webmanifest$|sandbox-worker\.js$|guide$|health$|legal\/|vendor\/|images\/|workspace\/|favicon)/;
const VENDOR = { pyodide: path.join(__dirname, "vendor", "pyodide") };
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".zip": "application/zip", ".whl": "application/octet-stream", ".tar": "application/x-tar", ".png": "image/png" };

async function handleRequest(req, res) {
    if (!okHost(req.headers.host) || !okOrigin(req.headers.origin)) return json(res, 403, { error: "Forbidden" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    if (pathname === "/shutdown" && req.method === "POST" && url.searchParams.get("key") === SHUTDOWN_KEY) {
      res.end("bye");
      return setTimeout(() => process.exit(0), 100);
    }
    if (!PUBLIC.test(pathname) && req.headers["x-ui-token"] !== UI_TOKEN && url.searchParams.get("t") !== UI_TOKEN)
      return json(res, 401, { error: "Unauthorized" });

    // ---- health and version (used by the launcher and installer) ----
    if (pathname === "/health") return json(res, 200, { ok: true, app: APP_NAME, version: VERSION });
    // ---- legal documents, readable inside the app ----
    const legal = pathname.match(/^\/legal\/(LICENSE|TERMS|PRIVACY|ACCEPTABLE_USE|THIRD_PARTY_NOTICES|DISCLAIMER)$/);
    if (legal) {
      const f = path.join(__dirname, legal[1] === "LICENSE" ? "LICENSE" : legal[1] + ".md");
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" });
      return fs.createReadStream(f).pipe(res);
    }

    // ---- the page itself, with this session's key ----
    if (pathname === "/" || pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(fs.readFileSync(path.join(__dirname, "index.html"), "utf8").replace("__UI_TOKEN__", UI_TOKEN));
    }
    // ---- bundled open-source libraries (Pyodide) ----
    const vend = pathname.match(/^\/vendor\/(\w+)\/(.+)$/);
    if (vend && VENDOR[vend[1]]) {
      const f = path.resolve(VENDOR[vend[1]], decodeURIComponent(vend[2]));
      if (!f.startsWith(VENDOR[vend[1]] + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "max-age=86400" });
      return fs.createReadStream(f).pipe(res);
    }

    // ---- Ollama proxy ----
    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/chat" || pathname === "/api/generate") await freeComfy();
      const upstream = http.request(new URL(req.url, OLLAMA), { method: req.method, headers: { "content-type": "application/json" } }, (up) => {
        res.writeHead(up.statusCode, { "content-type": up.headers["content-type"] || "application/json" });
        up.pipe(res);
      });
      upstream.on("error", () => json(res, 502, { error: "Can't reach Ollama. Is it running? (ollama serve)" }));
      req.pipe(upstream);
      res.on("close", () => upstream.destroy()); // stop generation/downloads when the app aborts
      return;
    }

    // ---- saved data (chats, presets, settings, memory) ----
    if (pathname === "/store") {
      try {
        if (req.method === "GET") {
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          return res.end(fs.existsSync(STORE) ? fs.readFileSync(STORE) : "{}");
        }
        if (req.method === "PUT" || req.method === "POST") {
          const body = (await readBody(req)).toString("utf8");
          JSON.parse(body); // refuse anything that isn't valid JSON
          saveStore(body);
          res.writeHead(204);
          return res.end();
        }
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    // ---- PDF text extraction for attachments (OCR for scanned pages) ----
    if (pathname === "/extract-pdf" && req.method === "POST") {
      try {
        const buf = await readBody(req, 50 * 1024 * 1024);
        let text = pdfText(buf), ocr = false;
        if (!text.trim()) {
          const pages = pdfJpegs(buf);
          const parts = [];
          for (const [i, jpg] of pages.entries()) parts.push(`--- Page ${i + 1} ---\n` + (await ocrImage(jpg)));
          text = parts.join("\n\n");
          ocr = pages.length > 0;
        }
        return json(res, 200, { text, ocr });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }
    // ---- OCR for attached pictures ----
    if (pathname === "/ocr" && req.method === "POST") {
      try { return json(res, 200, { text: await ocrImage(await readBody(req, 30e6)) }); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }

    // ---- document library ----
    if (pathname === "/library" && req.method === "GET")
      return json(res, 200, { docs: loadLib().docs.map((d) => ({ id: d.id, name: d.name, added: d.added, chars: d.chars, chunks: d.chunks.length })) });
    if (pathname === "/library/add" && req.method === "POST") {
      try { return json(res, 200, await libraryAdd(JSON.parse((await readBody(req, 60e6)).toString("utf8")))); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (pathname === "/library/search" && req.method === "POST") {
      try { return json(res, 200, await searchLibrary(JSON.parse((await readBody(req, 1e6)).toString("utf8")))); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    const libDel = pathname.match(/^\/library\/(d\w+)$/);
    if (libDel && req.method === "DELETE") {
      loadLib().docs = library.docs.filter((d) => d.id !== libDel[1]);
      saveLib();
      return json(res, 200, { ok: true });
    }

    // ---- private voice ----
    if (pathname === "/voice/status") return json(res, 200, voiceStatus());
    if (pathname === "/voice/transcribe" && req.method === "POST") {
      try { return json(res, 200, { text: await transcribe(await readBody(req, 50e6)) }); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (pathname === "/voice/speak" && req.method === "POST") {
      try {
        const wav = await speakText(JSON.parse((await readBody(req, 1e6)).toString("utf8")).text || "");
        res.writeHead(200, { "content-type": "audio/wav", "cache-control": "no-store" });
        return res.end(wav);
      } catch (e) { return json(res, 400, { error: e.message }); }
    }

    // ---- MCP tool servers ----
    if (pathname === "/mcp" && req.method === "GET") return json(res, 200, { config: loadMcpCfg(), status: mcp.status, presets: MCP_PRESETS });
    if (pathname === "/mcp" && req.method === "PUT") {
      try {
        const cfg = JSON.parse((await readBody(req, 1e6)).toString("utf8"));
        if (!cfg || typeof cfg.servers !== "object") throw new Error("Expected {\"servers\": {...}}");
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(MCP_CFG, JSON.stringify(cfg, null, 2));
        await mcpReload();
        return json(res, 200, { status: mcp.status });
      } catch (e) { return json(res, 400, { error: e.message }); }
    }

    // ---- what's installed (for the settings screens) ----
    if (pathname === "/capabilities")
      return json(res, 200, { image: imageReady(), imageExtras: imageExtras(), search: searxInstalled(), voice: voiceStatus(),
        sandbox: fs.existsSync(path.join(VENDOR.pyodide, "pyodide.js")), browser: fs.existsSync(path.join(__dirname, "node_modules", "playwright-core")), embed: true });

    // ---- image generation ----
    if (pathname === "/image/status") return json(res, 200, { ready: imageReady(), running: await comfyUp(), extras: imageExtras() });
    if (pathname === "/image" && req.method === "POST") return handleImage(req, res).catch((e) => json(res, 500, { error: e.message }));
    const img = pathname.match(/^\/images\/([\w-]+\.png)$/);
    if (img) {
      const f = path.join(IMG_DIR, img[1]);
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "content-type": "image/png", "cache-control": "max-age=31536000, immutable" });
      return fs.createReadStream(f).pipe(res);
    }

    // ---- agent tools ----
    const tool = pathname.match(/^\/tools\/(\w+)$/);
    if (tool && req.method === "POST") {
      const fn = TOOLS[tool[1]];
      if (!fn) return json(res, 404, { error: "No such tool" });
      try {
        const body = JSON.parse((await readBody(req, 20e6)).toString("utf8") || "{}");
        return json(res, 200, { ok: true, result: await fn(body.args || {}, body.cfg || {}) });
      } catch (e) {
        log("warn", `tool ${tool[1]} failed:`, e.message);
        return json(res, 200, { ok: false, error: e.message });
      }
    }
    // Workspace files, viewable in the app. Sandboxed so a page an agent wrote can't run scripts here.
    if (pathname.startsWith("/workspace/") && req.method === "GET") {
      try {
        const f = wsPath(decodeURIComponent(pathname.slice("/workspace/".length)));
        if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
        const ext = path.extname(f).toLowerCase();
        const type = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf" }[ext] || "text/plain; charset=utf-8";
        res.writeHead(200, { "content-type": type, "content-security-policy": "sandbox", "x-content-type-options": "nosniff", "cache-control": "no-cache" });
        return fs.createReadStream(f).pipe(res);
      } catch { res.writeHead(403); return res.end("Forbidden"); }
    }

    // ---- app files ----
    if (pathname === "/guide") {   // the user guide, as plain text in a new window
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" });
      return fs.createReadStream(path.join(__dirname, "INSTRUCTIONS.md")).pipe(res);
    }
    if (pathname === "/sandbox-worker.js") {
      // The browser enforces this on the sandbox: it may only load from this app (for Pyodide itself),
      // so sandboxed code can't send anything to the internet. Private endpoints also need the page's key.
      res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-cache",
        "content-security-policy": "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'none'" });
      return fs.createReadStream(path.join(__dirname, "sandbox-worker.js")).pipe(res);
    }
    const file = STATIC[pathname];
    if (file && fs.existsSync(path.join(__dirname, file[0]))) {
      res.writeHead(200, { "content-type": file[1], "cache-control": "no-cache" });
      return fs.createReadStream(path.join(__dirname, file[0])).pipe(res);
    }
    res.writeHead(404);
    res.end("Not found");
}

http
  .createServer((req, res) => handleRequest(req, res).catch((e) => {
    log("error", `${req.method} ${req.url.split("?")[0]}:`, e);
    if (!res.headersSent) json(res, 500, { error: "Something went wrong. Details are in data\\server.log." });
    else res.end();
  }))
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`${APP_NAME} is already running at http://localhost:${PORT}`);
      process.exit(0);
    }
    throw err;
  })
  .listen(PORT, "127.0.0.1", async () => {
    console.log(`${APP_NAME} ${VERSION} running at http://localhost:${PORT}\nKeep this window open while chatting. Close it to stop the app.`);
    log("info", `started ${APP_NAME} ${VERSION} on port ${PORT} (Node ${process.versions.node})`);
    try { await fetch(OLLAMA + "/api/version", { signal: AbortSignal.timeout(3000) }); }
    catch { console.log("Note: Ollama isn't reachable yet. Start Ollama to chat."); log("warn", "Ollama not reachable at startup"); }
    mcpReload().catch((e) => log("warn", "MCP:", e));
  });
