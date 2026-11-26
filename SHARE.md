# Sharing Mingo's Uncensored AI

Ready-made posts you can copy, tweak and share. The link:

**https://github.com/TFFVanta/Mingos-Uncensored-Ai**

> **Before posting anywhere**, read that community's rules. Many limit self-promotion (often "about 1 in 10
> of your posts may be your own project"), some require a flair or a specific day, and a few don't allow
> the word "uncensored" in titles. Reply to comments for the first few hours: it matters more than the post.

---

## Media kit

All of it shows real use of the app with demo chats. In the videos, waiting time is sped up and marked
"faster", so nobody is misled. Posts with a video or picture get far more attention than text alone.

| File | Best for |
|---|---|
| [docs/clips/full-demo.mp4](docs/clips/full-demo.mp4) (100 s) | YouTube, X/Bluesky, the top of a Reddit post |
| [docs/clips/swarm.mp4](docs/clips/swarm.mp4) (30 s) | r/LocalLLaMA, Hacker News comments, AI agent communities |
| [docs/clips/picture.mp4](docs/clips/picture.mp4) (20 s) | r/StableDiffusion, art communities |
| [docs/clips/library.mp4](docs/clips/library.mp4) (24 s) | r/selfhosted, privacy communities ("ask your own documents") |
| [docs/clips/compare.mp4](docs/clips/compare.mp4) (20 s) | r/ollama, model comparison threads |
| [docs/clips/themes.mp4](docs/clips/themes.mp4) (18 s) | Short posts, Threads, Discord |
| [docs/demo.gif](docs/demo.gif) | Places that don't play videos (forums, some Discord servers) |
| [docs/social-preview.png](docs/social-preview.png) | Link previews, a post's cover picture |
| [docs/screenshots/themes.png](docs/screenshots/themes.png) | One picture that shows the whole look |
| [docs/screenshots/](docs/screenshots/) | Image galleries: agent-swarm, pictures, ai-view, debate, compare, presets, models, attachments |

**Tips:** on Reddit, upload the video to the post itself rather than linking it, and put the GitHub link in the
first comment if the subreddit prefers that. On X, the video autoplays without sound, so the title cards
explain each clip. To download a file, open it on GitHub and choose "Download raw file".

---

## Reddit: r/LocalLLaMA

**Title:** I built a free, open-source desktop app that runs abliterated models with agent swarms, SDXL pictures, a document library and private voice, all local

**Post:**

> I wanted one app that does everything locally without refusals, so I built **Mingo's Uncensored AI**
> (Windows, MIT license, runs on Ollama).
>
> **What's in it:**
> - Chat with any Ollama model (defaults to huihui_ai's abliterated Qwen3), with presets, memory and compare mode
> - **Agent swarms:** Team (planner → specialists → reviewer), Lead (hires helpers on the fly) and Debate modes. Agents can run Python in a WebAssembly sandbox, search with a local SearXNG, browse with Playwright, make pictures and use MCP servers
> - **🧠 AI view** showing each reply's reasoning, every tool call with timings, and exactly what the model was given
> - **Pictures** with SDXL via ComfyUI: Lightning fast mode, IP-Adapter style reference, ControlNet outline, Real-ESRGAN upscaling
> - **Document library** with embeddings (nomic-embed-text), and private voice (whisper.cpp + Piper)
>
> **Things I cared about:** no telemetry, the server only listens on localhost with a per-session key, agents are
> confined to a workspace folder and can't reach your LAN, and a one-click installer that verifies every
> download's SHA-256. Agents also get flagged in the UI when a tool failed, because small models love to invent results.
>
> Tested on an RTX 2060 12 GB. Feedback very welcome, especially on agent reliability with different models.
>
> https://github.com/TFFVanta/Mingos-Uncensored-Ai

**Best as a video post:** choose "Images & Video", upload [docs/clips/swarm.mp4](docs/clips/swarm.mp4) (or
[full-demo.mp4](docs/clips/full-demo.mp4)) with the title above, pick the "Resources" or "Other" flair, then
paste the post text as your first comment. Add this line to it: *The video is real use; waiting time is
sped up and marked. You'll see one tool call fail and get flagged before the team reaches the right answer.*

---

## Reddit: r/selfhosted

**Title:** Mingo's Uncensored AI: a fully local AI workspace (chat, agents, image generation, document search) with no accounts or telemetry

**Post:**

> Open-source (MIT) Windows app that runs everything on your own machine: LLM chat through Ollama, AI agents with
> a sandboxed code runner and a private SearXNG instance, SDXL image generation, document search with local
> embeddings, and offline voice.
>
> No accounts, no cloud, no analytics. Everything lives in the app folder, and the privacy policy lists exactly
> which features go online (only web search and page reading, when you use them). The installer pins tested
> versions and verifies every download.
>
> https://github.com/TFFVanta/Mingos-Uncensored-Ai

---

## Reddit: r/ollama

**Title:** Built a desktop app on top of Ollama: agent swarms, image generation, document library and voice

**Post:**

> Mingo's Uncensored AI is a Windows app that turns Ollama into a full workspace: chat with presets and
> memory, a model manager (download/delete/see GPU usage), compare two models side by side, agent swarms with
> tools, SDXL pictures, a document library with nomic-embed-text, and local voice. It's MIT licensed and has
> no telemetry.
>
> https://github.com/TFFVanta/Mingos-Uncensored-Ai

---

## Reddit: r/StableDiffusion

**Title:** Local chat app where the LLM writes your SDXL prompts: Lightning, IP-Adapter, ControlNet and upscaling built in

**Post:**

> Describe a picture in plain words, the local LLM turns it into a detailed SDXL prompt, and ComfyUI draws it.
> Fast mode (SDXL-Lightning) takes ~10 s on an RTX 2060. Attach a picture to use it as a style reference
> (IP-Adapter) or outline (ControlNet canny), and upscale 2× with Real-ESRGAN. Agents can make pictures too.
> All local, MIT licensed.
>
> https://github.com/TFFVanta/Mingos-Uncensored-Ai

---

## Hacker News (Show HN)

**Title:** Show HN: Mingo's Uncensored AI – a private, local AI workspace for Windows

**Link:** https://github.com/TFFVanta/Mingos-Uncensored-Ai

**First comment (post it yourself right after submitting):**

> Hi HN, I built this because I wanted local models to be as capable as cloud assistants without sending
> anything off my machine.
>
> It's a single Node server plus one HTML file (no build step). It proxies Ollama and adds agent swarms
> (team/lead/debate) whose tools are confined to a workspace folder, a Pyodide sandbox for agent code
> (locked down with a worker CSP), Playwright browsing that blocks private IP ranges, SearXNG for search, and
> ComfyUI for SDXL. There's a per-session key on private endpoints so sandboxed code and other websites can't
> reach your chats.
>
> The models are "abliterated" (refusal direction removed), so it answers without lecturing. I kept one
> hard limit: no sexual images involving minors.
>
> The hardest part was small models inventing tool results, so failed or declined actions are flagged in the UI
> and the reviewer agent checks numbers against actual code output. Happy to answer questions.

---

## X / Bluesky / Threads

> I built Mingo's Uncensored AI 🔓: a free, open-source AI workspace that runs 100% on your own PC.
>
> 💬 Chat with uncensored local models
> 🐝 AI agent swarms that run code and search the web
> 🎨 SDXL pictures
> 📚 Search your own documents
> 🎤 Private voice
>
> No accounts. No cloud. MIT licensed.
> https://github.com/TFFVanta/Mingos-Uncensored-Ai

---

## Discord (#showcase channels)

> **Mingo's Uncensored AI**: a free, open-source desktop app (Windows) that runs everything locally on Ollama:
> chat, agent swarms with sandboxed tools, SDXL pictures, a document library and private voice. No accounts or
> telemetry. One-click installer. https://github.com/TFFVanta/Mingos-Uncensored-Ai

---

## "Awesome" lists

To get listed in curated GitHub lists (steady long-term traffic), open a pull request adding one line, following
each list's format and rules. A good one-liner:

> **[Mingo's Uncensored AI](https://github.com/TFFVanta/Mingos-Uncensored-Ai)**: private, all-in-one local AI workspace for Windows with agent swarms, SDXL pictures, a document library and voice, on Ollama.

Search GitHub for lists such as "awesome ollama", "awesome local llm" and "awesome selfhosted".

---

## Good to say up front

People will ask, so it helps to mention: **Windows only** for now, **an NVIDIA graphics card is recommended**,
and the full install with pictures is **about 20 GB** (chat-only is about 6 GB).
