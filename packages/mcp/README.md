# engram-vault-mcp

Give Claude Code, Claude Desktop or Cursor a memory you control.

Your AI tool asks your Engram vault, which stays open in a browser tab. The vault answers with only what is relevant,
from the topics you approved. You see every read, anything your tool saves arrives as a suggestion you confirm, and
you can revoke access in one click. This server holds no keys and stores no memory.

## Install

Claude Code:

```sh
claude mcp add -s user engram -- npx -y engram-vault-mcp
```

Claude Desktop (`claude_desktop_config.json`) or Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "engram": { "command": "npx", "args": ["-y", "engram-vault-mcp"] }
  }
}
```

Needs Node 22 or newer.

## Link your vault

1. Ask your AI tool to check your Engram vault status. It replies with a link.
2. Open the link. Chrome and Firefox ask once to allow local network access: allow it (that is how the vault tab
   reaches this server on `127.0.0.1`).
3. Unlock your vault with your passkey (or create one), pick the topics your tool may ask about, and approve.
4. Keep the tab open while you work. Each request shows up there and in your vault's read log.

The link changes each time your AI tool restarts the server.

## Tools

| Tool | What it does |
|---|---|
| `recall` | asks your vault what it knows that is relevant to a short query |
| `remember` | suggests a fact or preference for your vault; you confirm it there |
| `vault_status` | says whether the vault is linked, unlocked and approved, and gives the link if not |

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `ENGRAM_VAULT_URL` | `https://engram-vault.vercel.app` | your vault |
| `ENGRAM_AGENT_ID` | `2070` | the "Engram Desktop" agent id on Monad testnet |
| `ENGRAM_PORT` | `7457` | local port for the vault tab; one server per port, so give a second session another one |

Claude Code example for a second session: `claude mcp add engram2 -e ENGRAM_PORT=7458 -- npx -y engram-vault-mcp`.

## Security

- The vault tab and this server prove to each other that they know the one-time token from the link; the token is
  never sent over the connection. Another program on the port, or another website, gets nothing.
- What your vault shares goes into your AI tool's context, so its provider sees it. Engram limits and logs what is
  shared; it cannot make a provider forget it.
- Tested in Chromium and Firefox. Safari is not tested yet.

MIT license.
