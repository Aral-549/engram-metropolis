// Browser regressions for the agent chat page (BUGLOG RV-4, RV-5, RV-6, RV-7; contracts/ui.md U3, U28).
// Sage dev server (3201) only. Mocked, and only at the network layer: POST /api/chat answers canned JSON (no KIMI or
// Bedrock key), and the vault strip (http://localhost:3100/bridge) is a stub page that speaks the bridge postMessage
// protocol, so no vault, chain or passkey is needed. The page code under test is real.
import { expect, test, type Page } from "@playwright/test";

const SAGE = "http://localhost:3201/";
const CONNECTED = "engram-connected-assistant";
const CHAT = "engram-chat-assistant";
const UNSAVED = "engram-unsaved-assistant";

const STUB_BRIDGE = `<!doctype html><script>
parent.postMessage({ type: "engram:bridge:hello", v: 1 }, "*");
addEventListener("message", (e) => {
  const d = e.data;
  if (d && d.type === "engram:bridge:req") e.source.postMessage({ type: "engram:bridge:res", v: 1, id: d.id, ok: true, entries: [], mode: "relevant", receipt: "1" }, "*");
});
</script>`;

async function stubBridge(page: Page) {
  await page.route("http://localhost:3100/bridge**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: STUB_BRIDGE }));
}

/** Every POST /api/chat gets the next canned answer (the last one repeats). Returns the request bodies seen. */
async function chatAnswers(page: Page, answers: { status?: number; body: unknown }[]) {
  const seen: { messages: { role: string; content: string }[] }[] = [];
  let n = 0;
  await page.route("**/api/chat", async (route) => {
    seen.push(route.request().postDataJSON());
    const a = answers[Math.min(n++, answers.length - 1)]!;
    await route.fulfill({ status: a.status ?? 200, contentType: "application/json", body: JSON.stringify(a.body) });
  });
  return seen;
}

/** The pill in the chat (the flying clone has no data-fly, so it never makes this ambiguous). */
const pill = (page: Page, text: string) => page.locator("[data-fly]", { hasText: text });

const savedReply = (text: string) => ({ body: { reply: "Noted.", saved: [{ text }] } });

/** Counts flying clones ever added to <body> (they remove themselves after ~0.8 s). */
async function watchFlights(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __flights: number }).__flights = 0;
    new MutationObserver((ms) => {
      for (const m of ms) m.addedNodes.forEach((n) => { if (n instanceof HTMLElement && n.classList.contains("flight")) (window as unknown as { __flights: number }).__flights++; });
    }).observe(document, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { __flights: number }).__flights);
}

async function seedAndReload(page: Page, items: Record<string, unknown>) {
  await page.goto(SAGE);
  await page.evaluate((kv) => { for (const [k, v] of Object.entries(kv)) sessionStorage.setItem(k, JSON.stringify(v)); }, items);
  await page.reload();
}

async function connectedFlag(page: Page) {
  await page.addInitScript((k) => localStorage.setItem(k, "1"), CONNECTED);
}

test.describe("RV-4: saved pills fly into the vault strip once per new reply", () => {
  test("RV-4a: after Clear this chat, the next conversation's first saved reply flies again", async ({ page }) => {
    await connectedFlag(page);
    await stubBridge(page);
    const flights = await watchFlights(page);
    await chatAnswers(page, [savedReply("likes tea"), savedReply("likes oat milk")]);
    await page.goto(SAGE);
    const box = page.getByLabel("Message Sage");
    await box.fill("I like tea");
    await box.press("Enter");
    await expect(pill(page, "Saved: likes tea")).toBeVisible();
    await expect.poll(flights).toBe(1);
    await page.getByRole("button", { name: "Clear this chat" }).click();
    await expect(pill(page, "Saved: likes tea")).toHaveCount(0);
    await box.fill("I like oat milk");
    await box.press("Enter");
    await expect(pill(page, "Saved: likes oat milk")).toBeVisible();
    await expect.poll(flights, "a fresh conversation's saved reply must fly (flown ref reset)").toBe(2);
  });

  test("RV-4b: a reload does not re-fly the restored last reply, but a new saved reply still flies", async ({ page }) => {
    await stubBridge(page);
    const flights = await watchFlights(page);
    await chatAnswers(page, [savedReply("likes jazz")]);
    await seedAndReload(page, { [CHAT]: [{ role: "user", content: "hi" }, { role: "assistant", content: "Noted.", saved: [{ text: "likes tea" }] }] });
    await page.evaluate((k) => localStorage.setItem(k, "1"), CONNECTED);
    await page.reload();
    await expect(pill(page, "Saved: likes tea")).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await flights(), "restored reply must not fly").toBe(0);
    const box = page.getByLabel("Message Sage");
    await box.fill("I like jazz");
    await box.press("Enter");
    await expect(pill(page, "Saved: likes jazz")).toBeVisible();
    await expect.poll(flights).toBe(1);
  });

  test("RV-4c: a restored chat longer than 50 messages is cut to 50 and still does not re-fly", async ({ page }) => {
    await stubBridge(page);
    const flights = await watchFlights(page);
    const long = Array.from({ length: 60 }, (_, i) => (i % 2 ? { role: "assistant", content: `a${i}`, saved: [{ text: `m${i}` }] } : { role: "user", content: `q${i}` }));
    await seedAndReload(page, { [CHAT]: long });
    await page.evaluate((k) => localStorage.setItem(k, "1"), CONNECTED);
    await page.reload();
    await expect(pill(page, "Saved: m59")).toBeVisible();
    await expect(pill(page, "Saved: m9")).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(await flights()).toBe(0);
  });
});

test.describe("RV-5: a 401 on send keeps what was typed", () => {
  test("RV-5a: the message returns to the input exactly as typed (untrimmed), the chat is unchanged", async ({ page }) => {
    await chatAnswers(page, [{ status: 401, body: { code: "NO_SESSION", message: "no session" } }]);
    await page.goto(SAGE);
    const box = page.getByLabel("Message Sage");
    await box.fill("  keep this  ");
    await box.press("Enter");
    await expect(page.getByText("Connect your memory first.")).toBeVisible();
    await expect(box).toHaveValue("  keep this  ");
    // The failed message must not come back after a reload either.
    expect((await page.evaluate((k) => sessionStorage.getItem(k), CHAT)) ?? "").not.toContain("keep this");
    await page.reload();
    await expect(page.getByText("keep this")).toHaveCount(0);
  });

  test("RV-5b: a draft typed while the request was in flight is not overwritten", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/chat", async (route) => {
      await gate;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "NO_SESSION" }) });
    });
    await page.goto(SAGE);
    const box = page.getByLabel("Message Sage");
    await box.fill("first");
    await box.press("Enter");
    await box.fill("newer draft");
    release();
    await expect(page.getByText("Connect your memory first.")).toBeVisible();
    await expect(box).toHaveValue("newer draft");
  });

  test("RV-5c: a 401 after earlier turns keeps the earlier turns and drops only the failed one", async ({ page }) => {
    await chatAnswers(page, [{ body: { reply: "First answer" } }, { status: 401, body: { code: "NO_SESSION" } }]);
    await page.goto(SAGE);
    const box = page.getByLabel("Message Sage");
    await box.fill("one");
    await box.press("Enter");
    await expect(page.getByText("First answer")).toBeVisible();
    await box.fill("two");
    await box.press("Enter");
    await expect(box).toHaveValue("two");
    await expect(page.getByText("First answer")).toBeVisible();
  });
});

test.describe("RV-6: Clear this chat asks before dropping memories waiting for a vault", () => {
  const waiting = [{ kind: "fact", text: "likes tea" }];
  const chat = [{ role: "user", content: "hi" }, { role: "assistant", content: "Hello there" }];

  test("RV-6a: declined -> nothing is cleared, the dialog names the memories", async ({ page }) => {
    await seedAndReload(page, { [CHAT]: chat, [UNSAVED]: waiting });
    const dialogs: string[] = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await page.getByRole("button", { name: "Clear this chat" }).click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toMatch(/not in your vault yet/);
    await expect(page.getByText("Hello there")).toBeVisible();
    expect(JSON.parse((await page.evaluate((k) => sessionStorage.getItem(k), UNSAVED))!)).toEqual(waiting);
    expect(await page.evaluate((k) => sessionStorage.getItem(k), CHAT)).not.toBeNull();
  });

  test("RV-6b: accepted -> chat and waiting memories are gone, also after a reload", async ({ page }) => {
    await seedAndReload(page, { [CHAT]: chat, [UNSAVED]: waiting });
    page.on("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Clear this chat" }).click();
    await expect(page.getByText("Hello there")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Hello there")).toHaveCount(0);
    expect(JSON.parse((await page.evaluate((k) => sessionStorage.getItem(k), UNSAVED)) ?? "[]")).toEqual([]);
  });

  test("RV-6c: nothing waiting -> no dialog, cleared at once", async ({ page }) => {
    await seedAndReload(page, { [CHAT]: chat });
    let asked = false;
    page.on("dialog", (d) => { asked = true; void d.accept(); });
    await page.getByRole("button", { name: "Clear this chat" }).click();
    await expect(page.getByText("Hello there")).toHaveCount(0);
    expect(asked).toBe(false);
  });
});

test("RV-7 U28: the chat input has focus on arrival, with nothing in front of it", async ({ page }) => {
  await page.goto(SAGE);
  await expect(page.getByLabel("Message Sage")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.type("hello");
  await expect(page.getByLabel("Message Sage")).toHaveValue("hello");
});
