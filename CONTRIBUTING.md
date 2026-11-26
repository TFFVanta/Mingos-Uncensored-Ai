# Contributing to Mingo's Uncensored AI

Thanks for helping! Mingo's Uncensored AI was created by Mingo, and contributions are welcome.

## Getting started

```powershell
git clone <this repository>
cd <folder>
npm ci
npm test
npm start          # then open http://localhost:3000
```

The core app needs only Node.js 22+ and Ollama. Optional components (pictures, voice, search, sandbox,
OCR) can be installed with `Install.cmd`.

## How the code is organized

| File | What it does |
|---|---|
| `server.js` | The local server: Ollama proxy, saved data, agent tools, image engine, search, voice, OCR, MCP |
| `index.html` | The whole app interface (one file, no build step) |
| `sandbox-worker.js` | The locked-down Web Worker that runs agents' code |
| `LocalChat.ps1` | Desktop launcher |
| `setup/Setup.ps1` | Installer |
| `tests/` | Automated tests (`npm test`) |

## Guidelines

- **Privacy first.** Don't add analytics, telemetry or any network request the user didn't ask for.
  Features that go online must be clearly labeled and documented in [PRIVACY.md](PRIVACY.md).
- **Keep it dependency-light.** The app has no build step. Add npm packages only when really needed.
- **Security boundaries matter.** Changes touching the session key, origin checks, the workspace
  sandbox, the code sandbox or the local-network block need a test in `tests/`.
- **Keep the child-safety block** on picture generation. Pull requests that weaken it won't be accepted.
- Run `npm test` before opening a pull request, and describe what you changed and how you tested it.
- Plain, friendly wording in the interface: say what happens, not how it's implemented.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what happened. Relevant lines from
`data\server.log` help, but check them for anything private first. For security problems, see
[SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
