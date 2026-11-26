# How to use Mingo's Uncensored AI

*Created by Mingo.*

This guide covers everyday use. For installing the app and its optional features, see the
[README](README.md).

## Starting and stopping

- **Start:** double-click **Mingo's Uncensored AI** on the desktop or in the Start menu. The app opens in its own
  window. The first picture after starting takes about 90 seconds while the image engine warms up.
- **Stop:** close the window. Everything the app started (image engine, search engine, background
  browser, tool servers) shuts down with it.
- **Without the shortcut:** run `Start.cmd`, then open http://localhost:3000.

> If the window doesn't open, an older copy may still be running. Close any black Mingo's Uncensored AI
> console window and try again.

## Chatting

1. Pick a **Model** in the top bar. Good starting points:
   - `huihui_ai/qwen3-abliterated:8b`: everyday all-rounder
   - `huihui_ai/qwen3-vl-abliterated:4b`: can see pictures
   - `dolphin3`: fast, no thinking step
2. Pick a **Preset** for the job (General, Coder, Image Prompts, Creative Writer, Roleplay, Analyst,
   Editor). Each sets a personality and a temperature.
3. Type and press **Enter**. Use **Shift+Enter** for a new line.

| To… | Do this |
|---|---|
| Get a different answer | Hover over the reply → **🔁 Regenerate** |
| Fix what you asked | Hover over your message → **✏️ Edit**, change it, **Save & resend** |
| Compare two models | Tick **Compare**, choose the second model, then **Keep this one** on the better answer |
| Give one chat special rules | **Extra instructions** in the top bar |
| Make answers more creative or more focused | Raise or lower **Temp** (0.2 focused … 1.2 creative) |
| Stop a long answer | Press **Stop** |

**Chats** are listed on the left. Search them, 📌 pin favorites, double-click a title to rename it.

**Folders:** click **+ New folder** at the bottom of the list. Put a chat in one by dragging it onto the
folder, or with its **⋯** menu → **Move to folder**. Click a folder to open or close it; ✎ renames it and ✕
deletes it (its chats are kept).

**Export a chat:** its **⋯** menu → **Markdown** (a text file) or **PDF** (opens the print dialog: choose
**Save as PDF**). Pictures are included.

**Attachments:** click 📎, drag files onto the window, or paste. Text, code and PDF files are read in full
(scanned PDFs with OCR). Pictures are seen by vision models; for other models, any text in the
picture is read with OCR instead.

## Memory and your document library

- **Memory:** type `/remember I prefer short answers` (or edit the list in **⚙ Settings → Memory**).
  Every chat knows these facts.
- **Library:** add notes, documents and PDFs in **⚙ Settings → Library**, then tick **📚 Library** in
  the top bar. The AI looks up the most relevant passages for each message and says which document
  it used.

## Pictures

1. Describe the picture, then click **🖼** (or type `/image a castle on a hill at dawn`).
2. The chat model writes a detailed prompt, then the image engine draws it.
3. Under the picture: **🔁 New picture**, **⬆ Upscale 2×** (sharper, 2048 × 2048) or **📋 Copy prompt**.

**Edit part of a picture:** click **✏️ Edit part**, paint over what should change, describe what goes
there ("a red umbrella"), then **Apply**. Only the painted area changes; the edited copy appears under
the original.

**Remove the background:** click **✂️ Remove background** to cut out the subject as a PNG with a
transparent background. This needs the optional "Background removal" part of the installer.

**Guide it with your own picture:** attach a picture *before* clicking 🖼. In
**⚙ Settings → General → Pictures** choose whether it's used as a **style reference** (copies the look),
an **outline** (keeps the shapes), or both.

**⚡ Fast mode** (on by default) makes pictures in about 5–10 seconds. Turn it off for more detail
(about 30 seconds).

## Agent swarms

Choose a **Mode** in the top bar, then give the swarm a task.

| Mode | Best for |
|---|---|
| **🐝 Team** | Jobs with clear steps: a planner splits the work, specialists do it, a reviewer checks it |
| **👑 Lead** | Open-ended jobs: a lead agent hires helpers one at a time, even inventing new ones |
| **⚖️ Debate** | Questions with trade-offs: agents answer separately, critique each other, a judge decides |

Agents can work with files, run code, search the web, browse pages, make pictures and search your
library. Each agent's card shows what it's doing; open it to see every tool use and result.

**Approvals:** when an agent wants to do something risky (going online, deleting or replacing a file,
running code outside the sandbox), it waits for you:
**Allow**, **Allow everything for this task**, or **Deny**. Change this in **⚙ Settings → Agents**.

**Files agents make** are in the `workspace` folder and linked under the answer. Charts appear right in
the reply.

> ⚠️ If a yellow warning appears under a swarm's answer, some actions failed or were declined. Check
> that the answer doesn't depend on them.

## Seeing how the AI works

Click **🧠 AI view** in the top bar. Click any reply to inspect it.

- **Thoughts:** the reasoning the model wrote before answering, live as it's written
- **Actions:** every step with timings, speed and how full the context is
- **Perspective:** exactly what the model was given, and nothing else

## Voice

- **🎤 Voice typing:** click, speak, click again. It runs on your PC by default (English only).
- **🔊 Read aloud:** under any reply. The default "Piper" voice runs on your PC.

Change both in **⚙ Settings → General → Voice**.

## Settings at a glance

| Tab | What's there |
|---|---|
| **General** | Context length, auto titles, picture options, voice, export and import, updates |
| **Look** | Themes, accent color, text size, chat width |
| **Presets** | Edit personalities and their expectations (used by **Quality check**) |
| **Models** | What's installed, download or delete models, suggested models |
| **Memory** | Facts every chat knows |
| **Agents** | Approvals, sandbox, search engine, tools, debate team, agent roster, MCP servers, workspace |
| **Library** | Add and remove documents |

## Tips

- **Long chats get forgetful.** When the meter under the chat box turns yellow, start a new chat or raise
  the context length in **⚙ Settings → General**.
- **Thinking models can pause for a while.** Watch their thoughts in the 🧠 AI view.
- **Back up your chats** with **⚙ Settings → General → Export everything**.
- **Everything is saved** in `data\store.json`, with a backup copy up to an hour old.
- **Updates:** when a new version is out, a bar at the top offers **Update now**. It installs the new
  version and restarts; your chats, settings, models and workspace stay as they are. If you started the
  app from `Start.cmd`, the restarted app runs in the background: close it from the app window.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Ollama not reachable" | Start Ollama, then reopen the app |
| The window doesn't open | Close any old Mingo's Uncensored AI console window, then try again |
| A picture fails | Details are in `data\image-engine.log`. The first picture after starting is always slow |
| Search returns nothing | Details are in `data\search-engine.log`. Switch search to the basic option in **⚙ Settings → Agents** |
| A model refuses an image | It can't see pictures. Use `huihui_ai/qwen3-vl-abliterated:4b` |

---

**Mingo's Uncensored AI** was created by **Mingo**.
