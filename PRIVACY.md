# Privacy Policy

*Mingo's Uncensored AI. Last updated: 26 November 2026.*

## The short version

Mingo's Uncensored AI runs on your own computer. **Its creator doesn't collect, receive or store any
of your data.** There are no accounts, no analytics, no telemetry and no tracking. Your chats stay on
your PC unless you use one of the online features listed below.

## What's stored, and where

Everything is stored in the app's folder on your computer:

| Data | Location |
|---|---|
| Chats, presets, settings, memory, agent roster | `data\store.json` (plus an hourly backup `data\store.backup.json`) |
| Your document library and its search index | `data\library.json` |
| Generated pictures | `data\images\` |
| Files agents create | `workspace\` |
| Logs (errors and start-up information, not your chats) | `data\server.log`, `data\image-engine.log`, `data\search-engine.log` |
| An optional Brave Search API key, if you enter one | `data\store.json` |

To delete your data, delete those files or folders. **Export everything** in Settings makes a
backup copy you control.

## What leaves your computer, and only when you use it

| Feature | What's sent | To whom |
|---|---|---|
| Web search by agents (SearXNG) | Your search words, without cookies or anything that identifies you | Search engines such as DuckDuckGo, Google, Bing and Wikipedia |
| Basic web search (if selected) | Your search words | DuckDuckGo and Wikipedia |
| Brave Search (only if you add a key) | Your search words and your key | Brave |
| Reading or browsing web pages | A normal web request for that page | The website's owner |
| Online voice typing (if selected instead of the private default) | Your voice recording | Your browser's speech service (Microsoft for Edge, Google for Chrome) |
| "Online" read-aloud voices (marked as such) | The text being read | Microsoft |
| Downloading models and tools | Normal download requests | Ollama, Hugging Face, GitHub, npm, PyPI |
| MCP tool servers you turn on | Whatever that server is designed to do | Depends on the server; check its documentation |

The private defaults (Whisper voice typing, Piper read-aloud, sandboxed code and local models) don't
send anything anywhere.

## Security

The app's server only accepts connections from your own computer, rejects requests from other
websites, and requires a per-session key for anything private. Code that agents run in the sandbox
can't reach the internet or your files outside the workspace.

## Children

The Software is not intended for anyone under 18.

## Changes

This policy may be updated in new versions. The version included with your copy applies to that copy.

## Contact

Privacy questions: open an issue at https://github.com/TFFVanta/Mingos-Uncensored-Ai/issues.
