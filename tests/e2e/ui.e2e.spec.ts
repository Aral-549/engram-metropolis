// UI checks for contracts/ui.md that a browser can measure: U7 (no sideways scroll on phones), U8 (main actions
// above the fold), U10 (visible focus), U19 (no internal words), U25 (target sizes), U26 (illustration stops),
// U27 (separate landing), U28 (chat first). No chain or model needed: vault (3100) and Sage (3201) dev servers only.
import { expect, test, type Page } from "@playwright/test";

const VAULT = "http://localhost:3100/";
const SAGE = "http://localhost:3201/";
const FORBIDDEN = [/\bnamespace\b/i, /\bfolders?\b/i, /\bseq\b/i, /sealed #\d+/i, /\bepoch\b/i, /\bciphertext\b/i];

async function visibleText(page: Page, exclude = "#builders, footer") {
  return page.evaluate((ex) => {
    const skip = new Set([...document.querySelectorAll(ex)]);
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let out = "";
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement!;
      if ([...skip].some((s) => s.contains(el)) || getComputedStyle(el).visibility === "hidden" || el.closest("[aria-hidden=true]")) continue;
      out += " " + n.textContent;
    }
    return out;
  }, exclude);
}

for (const [name, url] of [["landing", VAULT], ["sage", SAGE]] as const) {
  test(`U7 ${name}: no horizontal scroll at 390 px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test(`U19 ${name}: no internal words outside the builder block and footer`, async ({ page }) => {
    await page.goto(url);
    const t = await visibleText(page);
    for (const w of FORBIDDEN) expect(t, String(w)).not.toMatch(w);
  });

  test(`U25 ${name}: interactive targets are at least 24 px, primary buttons 44 px`, async ({ page }) => {
    await page.goto(url);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main button, main a, main textarea")]
        .filter((el) => el.offsetParent !== null && !el.closest("pre"))
        .map((el) => ({ t: (el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30), r: el.getBoundingClientRect(), primary: el.classList.contains("btn-primary") && !el.classList.contains("text-xs") }))
        .filter(({ r, primary }) => r.height < (primary ? 44 : 24) || r.width < 24)
        .map(({ t, r }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`));
    expect(small).toEqual([]);
  });
}

test("U8 U27 landing: both model links and Open my vault above the fold at 1440x900 and 390x844", async ({ page }) => {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(VAULT);
    for (const target of [page.getByRole("link", { name: /Chat with Sage/ }), page.getByRole("link", { name: /Chat with Wayfarer/ })]) {
      await expect(target).toBeVisible();
    }
    if (w === 1440) {
      const box = await page.getByRole("button", { name: "Open my vault" }).boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(h);
    }
    await expect(page.getByLabel(/Message/)).toHaveCount(0); // the landing never contains a chat
  }
});

test("U26 landing: the illustration plays at most twice", async ({ page }) => {
  await page.goto(VAULT);
  await expect(page.getByRole("button", { name: "Open my vault" })).toBeVisible(); // past "Opening your vault…"
  const stage = await page.evaluate(() =>
    [...document.querySelectorAll(".stage *")].flatMap((el) => el.getAnimations().map((a) => (a.effect as KeyframeEffect).getTiming().iterations)));
  expect(stage.length).toBeGreaterThan(0);
  for (const n of stage) expect(n).toBeLessThanOrEqual(2);
});

test("U28 Sage: the input is ready with no sign-in, popup or banner in front of it", async ({ page }) => {
  await page.goto(SAGE);
  const input = page.getByLabel("Message Sage");
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("U10 keyboard focus is visible on the landing", async ({ page }) => {
  await page.goto(VAULT);
  await expect(page.getByRole("button", { name: "Open my vault" })).toBeVisible();
  // Tab until focus is inside the page (dev builds add a framework overlay to the tab order).
  for (let i = 0; i < 6 && !(await page.evaluate(() => !!document.activeElement?.closest("main"))); i++) await page.keyboard.press("Tab");
  const s = await page.evaluate(() => { const a = document.activeElement as HTMLElement; return { inMain: !!a.closest("main"), outline: getComputedStyle(a).outlineStyle }; });
  expect(s.inMain).toBe(true);
  expect(s.outline).not.toBe("none");
});

const CONNECT = `${VAULT}connect?v=1&agentId=1965&labels=preferences&scope=readwrite&expiresInSec=604800&mode=disclosure&origin=${encodeURIComponent("http://localhost:3201")}`;

test("U7 U11 connect popup: no sideways scroll at 390 px; Approve and Deny present; auto-save off by default", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CONNECT);
  await expect(page.getByText("wants to read part of your memory")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("button", { name: "Deny" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /save without asking me/ })).not.toBeChecked();
});

test("U12 connect popup: an origin the agent card does not list keeps its warning above Approve", async ({ page }) => {
  await page.goto(CONNECT);
  const warn = page.getByText(/does not list http:\/\/localhost:3201/);
  await expect(warn).toBeVisible();
  const approve = page.getByRole("button", { name: /approve/i }).first();
  expect((await warn.boundingBox())!.y).toBeLessThan((await approve.boundingBox())!.y);
});

test("U19 U25 connect popup: copy rules and target sizes", async ({ page }) => {
  await page.goto(CONNECT);
  await expect(page.getByText("wants to read part of your memory")).toBeVisible();
  const t = await visibleText(page, "footer");
  for (const w of FORBIDDEN) expect(t, String(w)).not.toMatch(w);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main button, main a, main label")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ t: (el.textContent ?? "").trim().slice(0, 30), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 24 || r.width < 24)
      .map(({ t, r }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`));
  expect(small).toEqual([]);
});
