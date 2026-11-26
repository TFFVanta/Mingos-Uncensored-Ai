# Security Policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Instead, report them privately through
GitHub: go to the repository's [Security tab](https://github.com/TFFVanta/Mingos-Uncensored-Ai/security) and choose **Report a vulnerability**.

Please include what you found, how to reproduce it, and what an attacker could do with it. You'll get
a reply as soon as possible, and credit in the release notes if you'd like.

## Supported versions

Security fixes go into the latest release. Please update before reporting.

## What counts as a vulnerability

The app's security model, and what would break it:

| Protection | A vulnerability would be… |
|---|---|
| The server only listens on `127.0.0.1` and refuses requests from other websites | A website or another computer reaching the app's endpoints |
| Private endpoints need a per-session key | Reading chats or running tools without it |
| Agents' files are confined to `workspace/` | An agent reading or writing anywhere else |
| Sandboxed code runs in a locked-down Web Worker | Sandboxed code reaching the network, the app's endpoints, or your files |
| Agents can't open addresses on your PC or local network | An agent reaching `localhost`, private IP ranges or local services |
| Sexual images of minors are blocked | A way around that block |

Not in scope: what the AI models themselves say (they're uncensored by design), and "On your PC" code
running with your account's permissions (that's a documented choice, and it asks for approval).
