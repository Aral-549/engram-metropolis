#!/usr/bin/env node
// engram-mcp: stdio MCP server + local vault link (contracts/mcp.md). stdout carries only MCP protocol (M16);
// the pairing link and structured logs go to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEngramMcp, startLink } from "./index.js";

const err = (s: string) => process.stderr.write(s + "\n");
const log = (line: Record<string, unknown>) => err(JSON.stringify(line));

// Defaults: the live Metropolis vault and its "Engram Desktop" agent (#2070 on Monad testnet).
const vault = (process.env.ENGRAM_VAULT_URL ?? "https://engram-vault.vercel.app").replace(/\/$/, "");
// Without ENGRAM_PORT a second session takes the next free port (contracts/mcp-multi-session.md); an explicit port is exact.
const explicitPort = process.env.ENGRAM_PORT !== undefined;
const port = Number(process.env.ENGRAM_PORT ?? 7457);
const SCAN_PORTS = 10;
const agentRaw = process.env.ENGRAM_AGENT_ID ?? "2070";

async function main() {
  if (!/^(0|[1-9]\d{0,77})$/.test(agentRaw)) throw new Error("ENGRAM_AGENT_ID must be a decimal agent id");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("ENGRAM_PORT must be a port number 1024-65535");
  const vaultOrigin = new URL(vault).origin;
  let link;
  for (let i = 0; ; i++) {
    try {
      link = await startLink({ port: port + i, vaultOrigin, agentId: BigInt(agentRaw), log });
      break;
    } catch (e) {
      const taken = (e as { code?: string }).code === "EADDRINUSE";
      if (!taken || explicitPort || i + 1 >= SCAN_PORTS) {
        throw taken && !explicitPort ? new Error(`ports ${port}-${port + SCAN_PORTS - 1} are all in use; set ENGRAM_PORT to another port`) : e;
      }
    }
  }
  err(`\nEngram: open this link in your browser to connect your memory vault:\n  ${link.url()}\n`);
  // Handlers first: a SIGTERM that lands right after the link is printed must still free the port and exit 0.
  const stop = async () => {
    await link.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stdin.on("close", stop);
  const server = createEngramMcp({ link, log });
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  err(`engram-vault-mcp: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
