// Tests how the app reads agents' tool calls, using broken calls real models have written.
// The functions live in index.html, so they're pulled out of it and run here.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const grab = (start) => {
  const i = html.indexOf(start);
  assert.ok(i >= 0, `found ${start}`);
  // Top-level definitions in index.html end with a "}" or "};" at the start of a line.
  const end = html.indexOf("\n}", i);
  return html.slice(i, html.indexOf("\n", end + 1));
};
const src = ["function lenientJSON(", "function toolCallFrom(", "const extractFinal =", "const TOOL_ALIASES =", "function parseAgentReply(", "function parseAgentReplyRaw("].map(grab).join("\n");
const { lenientJSON, parseAgentReply } = new Function(`${src}; return { lenientJSON, parseAgentReply };`)();
const tools = ["web_search", "read_webpage", "run_code", "write_file"];

test("several tool calls in one go: the first one is used", () => {
  const text = '<tool>{"name": "read_webpage", "args": {"url": "https://a.example/1"}}<tool>{"name": "read_webpage", "args": {"url": "https://b.example/2"}}<tool>{"na';
  const p = parseAgentReply(text, tools);
  assert.equal(p.tool, "read_webpage");
  assert.equal(p.args.url, "https://a.example/1");
  assert.equal(p.extra, true);
});

test("a missing closing brace is added", () => {
  const p = parseAgentReply('<tool>{"name": "web_search", "args": {"query": "primes below 1000"}</tool>', tools);
  assert.deepEqual([p.tool, p.args.query], ["web_search", "primes below 1000"]);
});

test("raw new lines in code, trailing commas and Python literals", () => {
  const p = parseAgentReply('<tool>{"name": "run_code", "args": {"code": "for i in range(3):\n    print(i)", "language": "python",},}</tool>', tools);
  assert.equal(p.tool, "run_code");
  assert.equal(p.args.code, "for i in range(3):\n    print(i)");
  assert.deepEqual(lenientJSON("{'a': True, 'b': None, 'c': 'it\\'s'}"), { a: true, b: null, c: "it's" });
  assert.deepEqual(lenientJSON('{name: "x", args: {}}'), { name: "x", args: {} });
});

test("other call shapes models use", () => {
  assert.equal(parseAgentReply('<tool>{"function": {"name": "web_search", "arguments": "{\\"query\\": \\"x\\"}"}}</tool>', tools).args.query, "x");
  assert.equal(parseAgentReply('<tool>{"tool": "web_search", "parameters": {"query": "y"}}</tool>', tools).args.query, "y");
  assert.equal(parseAgentReply('<tool>{"name": "web_search", "query": "z"}</tool>', tools).args.query, "z");
  assert.equal(parseAgentReply('<tool>{"name": "execute_code", "args": {"code": "print(1)"}}</tool>', tools).tool, "run_code");
});

test("code in a fenced block next to the call is used", () => {
  const p = parseAgentReply('<tool>{"name": "run_code", "args": {"language": "python"}}</tool>\n```python\nprint(2)\n```', tools);
  assert.equal(p.args.code, "print(2)\n");
});

test("final answers stay final answers", () => {
  assert.equal(parseAgentReply("<final>The sum is 76127.</final>", tools).final, "The sum is 76127.");
  assert.equal(parseAgentReply('<final>{"steps": [{"agent": "Coder", "task": "x"}]}</final>', tools).final, '{"steps": [{"agent": "Coder", "task": "x"}]}');
  assert.equal(parseAgentReply("Just a plain answer.", tools).final, "Just a plain answer.");
});

test("hopeless calls are reported as invalid, with the full text kept for repair", () => {
  const p = parseAgentReply("<tool>search for primes please</tool>", tools);
  assert.equal(p.tool, "invalid");
  assert.equal(p.fullRaw, "search for primes please");
});
