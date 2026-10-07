#!/usr/bin/env node
// engram-mcp: stdio MCP server + local vault link (contracts/mcp.md). stdout carries only MCP protocol (M16);
// the pairing link and structured logs go to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEngramMcp, startLink } from "./index.js";

const err = (s: string) => process.stderr.write(s + "\n");
const log = (line: Record<string, unknown>) => err(JSON.stringify(line));

const vault = (process.env.ENGRAM_VAULT_URL ?? "http://localhost:3100").replace(/\/$/, "");
const port = Number(process.env.ENGRAM_PORT ?? 7457);
const agentRaw = process.env.ENGRAM_AGENT_ID ?? "0";

async function main() {
  if (!/^(0|[1-9]\d{0,77})$/.test(agentRaw)) throw new Error("ENGRAM_AGENT_ID must be a decimal agent id");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("ENGRAM_PORT must be a port number 1024-65535");
  const vaultOrigin = new URL(vault).origin;
  const link = await startLink({ port, vaultOrigin, agentId: BigInt(agentRaw), log });
  err(`\nEngram: open this link in your browser to connect your memory vault:\n  ${link.url()}\n`);
  const server = createEngramMcp({ link, log });
  await server.connect(new StdioServerTransport());
  const stop = async () => {
    await link.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stdin.on("close", stop);
}

main().catch((e) => {
  err(`engram-mcp: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
