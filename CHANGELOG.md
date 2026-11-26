# Changelog

All notable changes to Mingo's Uncensored AI. Versions follow [Semantic Versioning](https://semver.org).

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
