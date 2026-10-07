# Give Claude Code, Claude Desktop or Cursor a memory you control

`engram-mcp` connects your AI tool to your own Engram vault. Your tool asks; your vault, open in a browser tab,
answers with only what is relevant, from the topics you approved. You see every read, what your tool saves arrives as
a suggestion you confirm, and you can revoke it in one click. `engram-mcp` holds no keys and stores no memory.

Spec: [`contracts/mcp.md`](../contracts/mcp.md).

## Install

Until the npm package is published, run it from this repository (Node 22+):

```sh
git clone <this repo> engram && cd engram && npm install
```

### Claude Code

```sh
claude mcp add engram -e ENGRAM_VAULT_URL=<vault url> -e ENGRAM_AGENT_ID=<agent id> -- node --import tsx /path/to/engram/packages/mcp/src/cli.ts
```

### Claude Desktop and Cursor

Add to `claude_desktop_config.json` (Claude Desktop) or `.cursor/mcp.json` (Cursor):

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["--import", "tsx", "/path/to/engram/packages/mcp/src/cli.ts"],
      "env": { "ENGRAM_VAULT_URL": "<vault url>", "ENGRAM_AGENT_ID": "<agent id>" }
    }
  }
}
```

## Link your vault (once per start)

1. Start your AI tool. `engram-mcp` prints a link to its log (stderr):
   `<vault url>/link?port=7457&agent=<id>#token=...`. Your tool's `vault_status` tool also returns it.
2. Open the link in your browser. Chrome asks once to allow access to your local network: allow it (that is how
   the vault tab reaches `engram-mcp` on `127.0.0.1`).
3. Unlock your vault with your passkey, pick the topics your tool may ask about, and approve.
4. Keep the tab open while you work. Each request shows up in the tab and in your vault's read log.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `ENGRAM_VAULT_URL` | `http://localhost:3100` | your vault |
| `ENGRAM_AGENT_ID` | `0` | the "Engram Desktop" ERC-8004 agent id on Monad testnet |
| `ENGRAM_PORT` | `7457` | local port for the vault tab; change it if it is taken |

## Security notes

- The vault tab and `engram-mcp` prove to each other that they know the one-time token from the link; the token is
  never sent over the connection (BUGLOG MC-1). Another program on the port, or another website, gets nothing.
- What your vault shares goes into your AI tool's context, so its provider sees it. Engram limits and logs what is
  shared; it cannot make a provider forget it.
- Tested in Chromium 152 and 153. Firefox and Safari are not tested yet.
