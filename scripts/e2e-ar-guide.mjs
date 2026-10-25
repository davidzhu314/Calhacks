import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.E2E_BASE_URL || "http://localhost:3101";
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}), args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"], reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
let guideCalls = 0, checkCalls = 0;
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/ar-guide", async (route) => { guideCalls++; await route.fulfill({ json: { visible: false, status: "absent", confidence: .8, explanation: "No build", orientationDegrees: null } }); });
await page.route("**/api/check", async (route) => { checkCalls++; await route.fulfill({ json: { can_see: true, step_complete: false, confidence: .9, issues: [{ part: "brick", problem: "misaligned", fix: "Move the brick", box: { x: .2, y: .2, w: .1, h: .1 } }], say: "Keep building" } }); });
await page.route("**/api/locate", async (route) => route.fulfill({ json: { callout: null, placed: null } }));
await page.route(/\/api\/(tts|speech-token|where-am-i)/, async (route) => route.abort());
try {
  await page.goto(base);
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open("keyval-store", 1); req.onupgradeneeded = () => req.result.createObjectStore("keyval"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction("keyval", "readwrite"); tx.objectStore("keyval").put({ id: "t1", source: "lego", title: "AR Test", subtitle: "Local", pdfPath: "/manual-pdf/lego/6455750.pdf", page: 5, addedAt: Date.now(), openedAt: Date.now() }, "manual:t1"); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.goto(`${base}/build/t1`);
  await page.getByRole("heading", { name: /Place the brown round 2x2 brick/ }).waitFor({ timeout: 20000 });
  const stepBefore = await page.locator("[aria-label='All steps'] [aria-current='step']").first().getAttribute("aria-label");
  await page.getByTestId("ar-toggle").click();
  await page.getByRole("button", { name: /AR assistant; drag/ }).click();
  await page.getByRole("button", { name: "Align / Re-align" }).click();
  await page.getByRole("button", { name: "Tap reference stud A on camera" }).click({ position: { x: 85, y: 290 } });
  await page.getByRole("button", { name: "Tap reference stud B on camera" }).click({ position: { x: 225, y: 290 } });
  await page.locator('svg[aria-label="2D guide ghost"] rect').waitFor({ timeout: 5000 });
  assert.equal(guideCalls, 0, "stored placement needs no model call");
  assert.equal(checkCalls, 0);
  assert.equal(await page.locator('svg[aria-label="2D guide ghost"] text').textContent(), "2D guide · check manual");
  await page.screenshot({ path: "/tmp/buildsight-ar-guide-v2-mobile.png" });
  await page.getByRole("button", { name: "Go to step 2" }).first().click();
  await page.getByRole("heading", { name: /Attach the second green half-circle/ }).waitFor();
  await page.locator('svg[aria-label="2D guide ghost"] rect').waitFor();
  assert.equal(guideCalls, 0, "later stored step reuses registration without model call");
  const stepAfter = await page.locator("[aria-label='All steps'] [aria-current='step']").first().getAttribute("aria-label");
  assert.notEqual(stepAfter, stepBefore);
  await page.getByTestId("ar-toggle").click();
  await page.locator('svg[aria-label="2D guide ghost"]').waitFor({ state: "hidden" });
  await page.getByTestId("ar-toggle").click();
  await page.locator('svg[aria-label="2D guide ghost"] rect').waitFor();
  await page.getByRole("button", { name: "Check build" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-issue-box]").length > 0);
  assert.equal(checkCalls, 1);
  assert.equal(guideCalls, 0);
  assert.deepEqual(errors, []);
  console.log(`AR v2 browser test passed: ${guideCalls} guide calls on stored steps, ${checkCalls} check`);
} finally {
  await browser.close();
}
