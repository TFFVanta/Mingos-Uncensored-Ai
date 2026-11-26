# Changelog

All notable changes to Mingo's Uncensored AI. Versions follow [Semantic Versioning](https://semver.org).

## [1.1.0] - 2026-11-26

### Added
- **Update notice:** when a newer version is on GitHub, a bar offers **Update now**, which installs it and
  restarts the app. Your chats, settings, models and workspace aren't touched. Turn the check off in
  ⚙ Settings → General → Updates.
- **Chat folders:** create folders, drag chats into them, rename, collapse.
- **Export a chat as PDF** (or Markdown) from each chat's ⋯ menu.
- **Edit part of a picture:** paint over an area and describe what should go there (inpainting). Only the
  painted area changes.
- **Remove a picture's background** (BiRefNet, optional in the installer, 425 MB).

### Fixed
- Agent teams finish far more cleanly. Tool calls that small models write in a broken way (several calls
  at once, a missing brace, Python-style JSON, other common formats) are now read correctly, and any that
  still can't be read are repaired automatically and marked "auto-repaired".
- Agents could fail to save files when the workspace folder was given with forward slashes or a different
  letter case. Full paths that point into the workspace now work too.
- An agent asking for a tool it doesn't have is now told which teammate has it.

## [1.0.1] - 2026-11-26

### Fixed
- Chatting right after making a picture could fail with "out of memory": the image engine releases
  graphics memory a moment after it's asked to, and the chat model tried to load before then. The app
  now waits until the memory is actually free.

### Added
- A demo GIF at the top of the README.

## [1.0.0] - 2026-11-26

First public release, created by Mingo.

### Added
- Private chat with any Ollama model: presets, memory, edit/regenerate, compare mode, attachments
  (text, code, PDF with OCR for scanned pages, pictures), search, pinning, auto-titles, export/import.
- 🧠 AI view showing each reply's reasoning, step-by-step actions, and exactly what the model was given.
- Quality check that reviews replies against each preset's expectations.
- Agent swarms (Team, Lead, Debate) with an editable roster, approvals for risky actions, and tools for
  workspace files, sandboxed code (Pyodide), private web search (SearXNG), a real browser
  (Playwright + Edge), pictures, document library search, OCR and MCP tool servers.
- Pictures with SDXL via ComfyUI: fast mode, style reference, outline guide and 2× upscaling.
- Document library with meaning-based search (nomic-embed-text).
- Private voice typing (whisper.cpp) and read-aloud (Piper).
- Desktop app window, one-click installer (`Install.cmd`) with verified downloads.
- First-run welcome with an 18+ age confirmation and Terms acceptance.
- Built-in block on sexual images involving minors.
- Legal documents: MIT License, Terms of Use, Acceptable Use Policy, Privacy Policy, Disclaimer and
  Third-Party Notices, all readable in the app.
- Server hardening: per-session key for private endpoints, origin checks, crash protection, a
  rotating log file, clean shutdown of every helper process, and an automated test suite.
- Screenshots, a social preview image, share buttons in the README and the app, and ready-made posts
  ([SHARE.md](SHARE.md)).
