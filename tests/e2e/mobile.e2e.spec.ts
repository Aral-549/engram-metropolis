// Mobile layout regression (contracts/ui.md U7): no horizontal overflow at 390 px on the vault landing, /link and
// /connect. Vault dev or start server on 3100 only; no chain or model needed.
import { expect, test } from "@playwright/test";

const VAULT = "http://localhost:3100";
const PAGES: [string, string][] = [
  ["landing", "/"],
  ["link", `/link?port=47001&agent=1965#token=${"a".repeat(32)}`],
  ["connect", `/connect?v=1&agentId=1965&labels=preferences&scope=readwrite&expiresInSec=604800&mode=disclosure&origin=${encodeURIComponent("http://localhost:3201")}`],
];

for (const [name, path] of PAGES) {
  test(`mobile ${name}: no horizontal overflow at 390 px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(VAULT + path);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
  });
}
