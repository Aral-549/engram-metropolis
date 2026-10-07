// End-to-end, Disclosure mode (contracts/disclosure.md) with the chat-first flow (contracts/simple-flow.md): a new
// user turns on memory in Sage and Wayfarer; the connect popup unlocks each app's vault strip itself (no second
// prompt), and the strip stays unlocked across a refresh. The agents never hold a key: every answer comes from the vault, through the
// bridge iframe, and every read is logged. Monad testnet, with the local dev model standing in for KIMI.
// Prereqs: indexer, dev model, vault (3100), Sage (3201), Wayfarer (3202) running, AGENT_MODE=disclosure.
// Uses a synced-passkey stand-in (tests/support/fake-passkey.ts) so popup and iframe share one passkey.
import { expect, test, type Page } from "@playwright/test";
import { fakePasskeyScript } from "../support/fake-passkey.js";

test.beforeEach(async ({ context }, info) => {
  await context.addInitScript({ content: fakePasskeyScript(`e2e-${info.title}-${Date.now()}`) });
});

async function connectAndUnlock(page: Page) {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /^Turn on memory/ }).first().click();
  const popup = await popupPromise;
  await expect(popup.getByText("wants to read part of your memory")).toBeVisible();
  await expect(popup.getByText("It never gets a key.")).toBeVisible();
  await popup.getByRole("button", { name: "New here? Create a vault and approve" }).click();
  await expect(popup.getByRole("heading", { name: "Access granted" })).toBeVisible({ timeout: 90_000 });
  await popup.waitForEvent("close", { timeout: 10_000 }).catch(() => undefined);
  // simple-flow.md C1/F1: the popup handed its session to the strip, so there is no "Unlock memory" step.
  const strip = page.frameLocator("iframe.engram-bridge");
  await expect(strip.getByText("sharing only what is relevant")).toBeVisible({ timeout: 60_000 });
  await expect(strip.getByRole("button", { name: "Unlock memory" })).toHaveCount(0);
  return strip;
}

test("Sage: proposals are saved by the vault, and a full read is logged", async ({ page }) => {
  await page.goto("http://localhost:3201/");
  const strip = await connectAndUnlock(page);
  await expect(page.getByText("memory connected · can read and add")).toBeVisible();
  // simple-flow.md C7: a refresh keeps the strip unlocked (restored from its own device store, no prompt).
  await page.reload();
  await expect(page.frameLocator("iframe.engram-bridge").getByText("sharing only what is relevant")).toBeVisible({ timeout: 60_000 });
  // simple-flow.md B2 C36/C37: a new tab keeps nothing; "Resume memory" brings it back from the vault site's copy, no prompt.
  const again = await page.context().newPage();
  await again.goto("http://localhost:3201/");
  const resumeStrip = again.frameLocator("iframe.engram-bridge");
  const resumePopup = again.waitForEvent("popup");
  await resumeStrip.getByRole("button", { name: "Resume memory" }).click();
  await (await resumePopup).waitForEvent("close", { timeout: 30_000 }).catch(() => undefined);
  await expect(resumeStrip.getByText("sharing only what is relevant")).toBeVisible({ timeout: 60_000 });
  await again.close();

  await page.getByLabel("Message Sage").fill("I am vegetarian and I am allergic to peanuts.");
  await page.getByRole("button", { name: "Send" }).click();
  const chip = page.getByRole("link", { name: "saved to your memory: I am vegetarian" });
  await expect(chip).toBeVisible({ timeout: 90_000 });
  // Disclosure mode: the app never gets the tx (it names the owner, D33); the chip opens the user's own vault.
  await expect(chip).toHaveAttribute("href", /^http:\/\/localhost:3100/);
  await expect(page.getByRole("link", { name: "saved to your memory: I am allergic to peanuts" })).toBeVisible();
  await expect(strip.getByText(/Saved for you, waiting for your review: I am/)).toBeVisible();

  await page.getByLabel("Message Sage").fill("What do you know about me?");
  await page.getByRole("button", { name: "Send" }).click();
  // A full read returns newest first (contracts/disclosure.md, full mode), so either order is correct here.
  await expect(page.getByText(/From what you shared: .*(I am vegetarian.*peanuts|peanuts.*I am vegetarian)/)).toBeVisible({ timeout: 60_000 });
  await expect(strip.getByText(/Full read 2: /)).toBeVisible();

  // The owner's vault shows the proposals credited to Sage and the reads log.
  const vault = await page.context().newPage();
  await vault.goto("http://localhost:3100/");
  await vault.getByRole("button", { name: "I already have one, unlock it" }).click();
  await expect(vault.getByRole("heading", { name: "What your AI knows about you" })).toBeVisible({ timeout: 60_000 });
  // Locally the card proxy is https-only, so the name falls back to the agent id; deployed it reads "Sage".
  await expect(vault.getByText(/Proposed by (Sage|Agent #\d+)/).first()).toBeVisible({ timeout: 60_000 });
  await vault.getByRole("button", { name: "Reads" }).click();
  await expect(vault.getByText("asked for everything").first()).toBeVisible({ timeout: 60_000 });
});

test("Wayfarer: read-only, plans without writing; revoke in the strip and it forgets at once", async ({ page }) => {
  await page.goto("http://localhost:3202/");
  const strip = await connectAndUnlock(page);
  await expect(page.getByText("memory connected · read only")).toBeVisible();
  await page.getByLabel("Message Wayfarer").fill("Plan a weekend in Goa for me.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/\[dev model\] Here is a quick plan/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: /saved to your memory/ })).toHaveCount(0);
  await expect(strip.getByText(/Asked, nothing relevant shared/)).toBeVisible();

  await strip.getByRole("button", { name: "Revoke" }).click();
  await expect(strip.getByText("Not approved for this site")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Message Wayfarer").fill("Plan three dinners for this week.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/You revoked my access/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Access revoked by you/)).toBeVisible();
});

test("Sage proposes, you confirm in the vault, Wayfarer plans around it (provenance.md P3)", async ({ page, context }) => {
  // One synced passkey for every page in this context, so Sage, the vault and Wayfarer share one vault.
  await page.goto("http://localhost:3201/");
  await connectAndUnlock(page);
  await page.getByLabel("Message Sage").fill("I am vegetarian and I am allergic to peanuts.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("link", { name: "saved to your memory: I am allergic to peanuts" })).toBeVisible({ timeout: 90_000 });

  // Quarantined: review in the vault and confirm both.
  const vault = await context.newPage();
  await vault.goto("http://localhost:3100/");
  await vault.getByRole("button", { name: "I already have one, unlock it" }).click();
  await expect(vault.getByRole("heading", { name: "What your AI knows about you" })).toBeVisible({ timeout: 60_000 });
  await vault.getByRole("button", { name: /^Review/ }).click();
  await expect(vault.getByRole("heading", { name: "Review what agents proposed" })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await vault.getByRole("button", { name: "Confirm", exact: true }).first().click({ timeout: 60_000 });
    await expect(vault.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(1 - i, { timeout: 60_000 });
  }
  await expect(vault.getByText(/Nothing waiting/)).toBeVisible();

  // Wayfarer, approved on the same vault, now gets the confirmed allergy as the owner's own memory.
  const way = await context.newPage();
  await way.goto("http://localhost:3202/");
  const popupPromise = way.waitForEvent("popup");
  await way.getByRole("button", { name: /^Turn on memory/ }).first().click();
  const popup = await popupPromise;
  // The vault is still signed in on this device (simple-flow.md B): the popup opens unlocked, Approve only.
  await popup.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(popup.getByRole("heading", { name: "Access granted" })).toBeVisible({ timeout: 90_000 });
  const strip = way.frameLocator("iframe.engram-bridge");
  await expect(strip.getByText("sharing only what is relevant")).toBeVisible({ timeout: 60_000 });
  await way.getByLabel("Message Wayfarer").fill("Plan three dinners this week, mind my allergies.");
  await way.getByRole("button", { name: "Send" }).click();
  await expect(way.getByText(/Using what you shared \(.*allergic to peanuts/)).toBeVisible({ timeout: 60_000 });
  await expect(strip.getByText(/Shared 1: I am allergic to peanuts/)).toBeVisible();
});
