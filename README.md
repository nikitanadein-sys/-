# VPS connection — via `ssh-mcp`

This project reaches the VPS **`31.76.57.55`** (login `root`) through the ready‑made
[`ssh-mcp`](https://www.npmjs.com/package/ssh-mcp) MCP server, **over the existing
SSH key** (`~/.ssh/id_ed25519`). Nothing is installed on the VPS — it only needs an
open **SSH (port 22)**.

The client config is the project‑level [`.mcp.json`](./.mcp.json). Any MCP client that
reads it (Claude Desktop/Cursor/pi, etc.) will spawn `ssh-mcp` via `npx` and get the
tools below.

```
 this project                                        VPS  31.76.57.55
 .mcp.json ─▶ npx ssh-mcp  ──(SSH, key auth)──▶   sshd  (port 22)   ← nothing else
   (stdio MCP)                                      runs as root
```

## Tools you get (14)

| Group | Tools |
|-------|-------|
| Commands | `run-command` (arbitrary, runs as root), `read-command` (allowlisted read‑only), `privileged-command` (sudo) |
| Sessions | `open-session`, `close-session`, `list-sessions`, `read-session-output`, `signal-process` (stateful shells / PTY) |
| Files (SFTP) | `sftp-list`, `sftp-upload`, `sftp-download`, `sftp-upload-file`, `sftp-download-file` |
| Introspection | `list-connections` |

## Quick verify (from this machine)

```bash
# health of the underlying SSH key:
ssh -o BatchMode=yes root@31.76.57.55 'hostname && id'
```

The MCP path itself is exercised whenever your client loads `.mcp.json`; `ssh-mcp`
auto‑downloads on first use via `npx -y`.

## How it's configured

`.mcp.json` runs `ssh-mcp` in **quick‑start** mode with:

* `--host=31.76.57.55 --user=root --port=22` — the target
* `--group=dev` — policy tier (dev/staging/prod); `dev` is the permissive tier
* `--disableApproval` — skip the human‑in‑the‑loop approval gate (valid for quick‑start)
* `env.SSH_MCP_KEY=C:/Users/Optimus/.ssh/id_ed25519` — the private key (path is
  **machine‑specific**; update if the key moves)

The public half of that key was already placed on the VPS (`ssh-copy-id root@31.76.57.55`).

## Security trade‑offs (this is the “just make it work” config)

* **root** — the README advises a non‑root user; our VPS only has `root`, so `run-command`
  is powerful. Treat the private key as high‑value.
* **`--group=dev` + `--disableApproval`** — commands run without a human approving them.
  Great for a personal box, not for shared/prod hosts.
* **Host‑key** verification is trust‑on‑first‑use (in‑memory per process) by default.

To tighten it, replace the quick‑start flags with a named TOML profile
(`%APPDATA%\ssh-mcp\config.toml`, pass `--config <path>` in `.mcp.json`):

```toml
[defaults]
defaultProfile = "vps"
approvalMode = "ask-destructive"   # auto | ask-destructive | ask-all | deny

[[profiles]]
name = "vps"
host = "31.76.57.55"
port = 22
user = "root"
auth = "key"
keyRef = "C:/Users/Optimus/.ssh/id_ed25519"
role = "admin"                     # viewer | operator | admin
group = "prod"                     # prod | staging | dev
trustedHostKey = "sha256:<pin>…"   # optional: pin the host key (survives restarts)
```

…and drop `--disableApproval` from `.mcp.json`, so destructive/privileged commands are
gated by `approvalMode`.

## Rollback / teardown

There is nothing to uninstall on the VPS. To disconnect, delete `.mcp.json` (and, if you
ever used it, `%APPDATA%\ssh-mcp\config.toml`). To revoke access, remove the key's public
half from the VPS: `ssh root@31.76.57.55 'sed -i "/<pub-key-hash>/d" ~/.ssh/authorized_keys'`.
