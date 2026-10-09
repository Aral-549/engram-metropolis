// Browser checks for contracts/feedback.md: R1 (control on every listed page), R2 (dialog, focus, Escape), R3 (sent),
// R4 (the /link token never leaves the page), R8/R10 messages (text kept), R12 (only the listed fields are sent).
// The route's answers are intercepted here; the route itself is covered by tests/golden/vault/vault.report.golden.test.ts.
// Vault (3100) and Sage (3201) dev servers; no chain, model or Redis needed.
import { expect, test, type Page, type Request } from "@playwright/test";

const VAULT = "http://localhost:3100";
const SAGE = "http://localhost:3201/";
const TOKEN = "0123456789abcdef0123456789abcdef";

async function capture(page: Page, status = 201) {
  const sent: Request[] = [];
  await page.route("**/api/report", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" } });
    sent.push(route.request());
    await route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(status === 201 ? { ok: true } : { ok: false, code: status === 429 ? "RATE_LIMITED" : "SEND_FAILED" }) });
  });
  return sent;
}

for (const [name, url] of [
  ["landing", `${VAULT}/`],
  ["link", `${VAULT}/link?port=7457&agent=2070#token=${TOKEN}`],
  ["connect", `${VAULT}/connect`],
  ["sage", SAGE],
] as const) {
  test(`R1 R2 ${name}: a Report a bug control opens a focused dialog that Escape closes; no hydration errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    const open = page.getByRole("button", { name: "Report a bug" });
    await expect(open).toBeVisible();
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await open.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Report a bug" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("What happened?")).toBeFocused();
    await expect(dialog.getByText(/Sent with this report/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(errors.filter((e) => /hydrat|cannot be a descendant|cannot contain/i.test(e))).toEqual([]);
  });
}

test("R3 R4 R12 /link: sends the path without the query or #token, and only the listed fields", async ({ page }) => {
  const sent = await capture(page);
  await page.goto(`${VAULT}/link?port=7457&agent=2070#token=${TOKEN}`);
  await page.getByRole("button", { name: "Report a bug" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("page /link,")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send" })).toBeDisabled(); // R5
  await dialog.getByLabel("What happened?").fill("Link page stuck on connecting");
  await dialog.getByLabel(/Email or handle/).fill("@tester");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Thanks, sent.")).toBeVisible();
  expect(sent).toHaveLength(1);
  const raw = sent[0]!.postData()!;
  expect(raw).not.toContain(TOKEN);
  expect(raw).not.toContain("port=");
  const body = JSON.parse(raw);
  expect(Object.keys(body).sort()).toEqual(["app", "contact", "path", "ua", "vh", "vw", "website", "what"]);
  expect(body).toMatchObject({ app: "vault", path: "/link", what: "Link page stuck on connecting", contact: "@tester", website: "" });
});

test("R3 Sage posts to the vault's /api/report as app sage", async ({ page }) => {
  const sent = await capture(page);
  await page.goto(SAGE);
  await page.getByRole("button", { name: "Report a bug" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What happened?").fill("Sage kept thinking");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Thanks, sent.")).toBeVisible();
  expect(sent[0]!.url()).toBe(`${VAULT}/api/report`);
  expect(JSON.parse(sent[0]!.postData()!)).toMatchObject({ app: "sage", path: "/" });
});

test("R8 R10 a refused or failed send says so and keeps the text", async ({ page }) => {
  for (const [status, msg] of [[429, "Too many reports, try again in a few minutes."], [503, "Couldn't send. Try again later."]] as const) {
    await page.unrouteAll();
    await capture(page, status);
    await page.goto(`${VAULT}/`);
    await page.getByRole("button", { name: "Report a bug" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What happened?").fill("keep me");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(msg);
    await expect(dialog.getByLabel("What happened?")).toHaveValue("keep me");
  }
});

test("R10 offline: the text stays in the box", async ({ page, context }) => {
  await page.goto(`${VAULT}/`);
  await page.getByRole("button", { name: "Report a bug" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What happened?").fill("offline report");
  await context.setOffline(true);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Couldn't send. Try again later.");
  await expect(dialog.getByLabel("What happened?")).toHaveValue("offline report");
  await context.setOffline(false);
});

test("R13 the live route refuses GET (no way to read reports)", async ({ request }) => {
  const res = await request.get(`${VAULT}/api/report`);
  expect(res.status()).toBe(405);
});
