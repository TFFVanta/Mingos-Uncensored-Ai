# Third-Party Notices

Mingo's Uncensored AI's own code is MIT-licensed (see [LICENSE](LICENSE)). It works with the
third-party software and models below. **None of them are included in this repository**: the installer
or the user downloads each one from its official source, and each keeps its own license. If you
redistribute any of them, for example in a bundled installer, you must follow its license.

Licenses below are as declared by each project at the time of writing. Always check the linked page.

## Software

| Component | Used for | License |
|---|---|---|
| [Ollama](https://github.com/ollama/ollama) | Running language models | MIT |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI) | Image engine | GPL-3.0 |
| [ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) | Style reference for pictures | GPL-3.0 |
| [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | Picture upscaling model | BSD-3-Clause |
| [SearXNG](https://github.com/searxng/searxng) | Private web search | AGPL-3.0 |
| [Pyodide](https://github.com/pyodide/pyodide) (with numpy, pandas, matplotlib and their dependencies) | Code sandbox | MPL-2.0 (packages under their own licenses) |
| [Playwright](https://github.com/microsoft/playwright) | Agents' web browser | Apache-2.0 |
| [tesseract.js](https://github.com/naptha/tesseract.js) and [Tesseract trained data](https://github.com/tesseract-ocr/tessdata_best) | OCR | Apache-2.0 |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Private voice typing | MIT |
| [Piper](https://github.com/rhasspy/piper) | Private read-aloud | MIT |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | MCP tool servers | MIT |

## Models

| Model | Used for | License |
|---|---|---|
| [Stable Diffusion XL base 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | Pictures | CreativeML Open RAIL++-M (includes use restrictions) |
| [SDXL-Lightning](https://huggingface.co/ByteDance/SDXL-Lightning) | Fast pictures | OpenRAIL++ |
| [ControlNet canny SDXL small](https://huggingface.co/diffusers/controlnet-canny-sdxl-1.0-small) | Outline guide | OpenRAIL++ |
| [IP-Adapter](https://huggingface.co/h94/IP-Adapter) | Style reference | Apache-2.0 |
| [CLIP ViT-H-14 (LAION)](https://huggingface.co/laion/CLIP-ViT-H-14-laion2B-s32B-b79K) | Image encoder for IP-Adapter | MIT |
| [Whisper base.en (ggml)](https://huggingface.co/ggerganov/whisper.cpp) | Voice typing | MIT |
| [Piper voices (en_US lessac)](https://huggingface.co/rhasspy/piper-voices) | Read-aloud voice | MIT (see the voice's model card for its training data) |
| [nomic-embed-text](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) | Library search | Apache-2.0 |
| [Qwen3](https://huggingface.co/Qwen/Qwen3-8B) and [Qwen3-VL](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct), abliterated versions by [huihui-ai](https://huggingface.co/huihui-ai) | Chat and vision models | Apache-2.0 |
| [Dolphin 3.0 (Llama 3.1 8B)](https://huggingface.co/cognitivecomputations/Dolphin3.0-Llama3.1-8B) | Chat model | Llama 3.1 Community License (includes an acceptable use policy) |

Model licenses such as CreativeML Open RAIL++-M and the Llama 3.1 Community License include
**restrictions on how the model and its output may be used**. Using the Software doesn't remove those
restrictions.

## npm packages

The Node.js packages installed by `npm install` (listed in `package-lock.json`) are distributed under
their own licenses, mostly MIT and Apache-2.0.
