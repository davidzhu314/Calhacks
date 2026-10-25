import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.E2E_BASE_URL || "http://localhost:3101";
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"], reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
let guideCalls = 0;
const guideParts = [];
let holdGround = false;
let releaseGround = null;
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/ar-guide", async (route) => {
  guideCalls++;
  const { mode, part } = route.request().postDataJSON();
  guideParts.push(part);
  if (holdGround && mode === "ground") {
    holdGround = false;
    await new Promise((resolve) => { releaseGround = resolve; });
  }
  const response = mode === "fine"
    ? { visible: true, confidence: .95, explanation: "Approximate spot", placement: { x: .5, y: .5 }, orientationDegrees: 0 }
    : { visible: true, status: "present", confidence: .95, explanation: "Assembly found", assemblyBox: { left: .2, top: .2, right: .8, bottom: .8 }, partBox: { left: .3, top: .3, right: .4, bottom: .4 }, placement: null, orientationDegrees: 0 };
  await route.fulfill({ json: response }).catch(() => {}); // navigation may abort the held request
});
await page.route("**/api/locate", async (route) => route.fulfill({ json: { callout: null, placed: null } }));
await page.route(/\/api\/(tts|speech-token|where-am-i)/, async (route) => route.abort());
const say = (phrase) => page.evaluate((text) => window.dispatchEvent(new CustomEvent("buildsight:voice-command", { detail: text })), phrase);

try {
  await page.goto(base);
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open("keyval-store", 1); req.onupgradeneeded = () => req.result.createObjectStore("keyval"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction("keyval", "readwrite"); tx.objectStore("keyval").put({ id: "voice-ar", source: "lego", title: "Voice AR test", subtitle: "Local", pdfPath: "/manual-pdf/lego/6455750.pdf", page: 5, addedAt: Date.now(), openedAt: Date.now() }, "manual:voice-ar"); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.goto(`${base}/build/voice-ar?voiceTest=1`);
  await page.getByRole("heading", { name: /Place the brown round 2x2 brick/ }).waitFor({ timeout: 20000 });
  await say("show me where");
  await page.getByTestId("ar-toggle").getAttribute("aria-pressed").then((value) => assert.equal(value, "true"));
  await page.getByRole("button", { name: /AR assistant; drag/ }).click();
  assert.match(await page.getByRole("group", { name: "AR assistant" }).textContent(), /3 studs right and 2 studs inward from the first plate/);
  await page.getByRole("button", { name: "Align / Re-align" }).click();
  await page.getByRole("button", { name: "Tap 1: left end stud on the first green plate in the camera" }).click({ position: { x: 85, y: 450 } });
  await page.getByRole("button", { name: "Tap 2: right end stud on the first green plate in the camera" }).click({ position: { x: 225, y: 450 } });
  const ghost = page.getByLabel("Placement ghost", { exact: true });
  await ghost.waitFor();
  await page.getByRole("button", { name: "Expand step card" }).click();
  assert.match(await ghost.textContent(), /Step 1: place here/);
  assert.equal(guideCalls, 0, "stored placement does not call Claude");
  const oldGhost = await ghost.elementHandle();
  await say("show me where");
  await page.waitForFunction((old) => !old.isConnected, oldGhost);
  await page.getByRole("button", { name: "Browse steps" }).first().click();
  await page.getByRole("dialog", { name: "Browse steps" }).getByRole("button", { name: /Step 2 · Page 5/ }).click();
  assert.match(await ghost.textContent(), /Step 1: place here/, "preview leaves active ghost unchanged");
  await page.getByRole("button", { name: "Close step browser" }).click();
  const beforeNext = await ghost.getAttribute("transform");
  await say("next");
  await page.getByRole("heading", { name: /Attach the second green half-circle/ }).waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="Placement ghost"]')?.textContent?.includes("Step 2:"));
  assert.notEqual(await ghost.getAttribute("transform"), beforeNext, "new step has its own stud ghost");
  assert.equal(guideCalls, 0);
  await say("go to step 8");
  await page.getByRole("heading", { name: /Slide the brown round brick onto the grey bars/ }).waitFor({ timeout: 20000 });
  await page.getByTestId("ar-placement").waitFor({ timeout: 15000 });
  assert.match(await page.getByTestId("ar-placement").textContent(), /Step 8:/);
  assert.equal(await ghost.count(), 0, "stored ghost from step 2 is gone");
  holdGround = true;
  await say("rescan");
  for (let i = 0; !releaseGround && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(releaseGround, "step 8 rescan began");
  await say("next");
  await page.getByRole("heading", { name: /Slide the brown round brick onto the grey bars/ }).waitFor();
  releaseGround();
  await page.waitForTimeout(200);
  assert.equal(await page.getByTestId("ar-placement").filter({ hasText: "Step 8:" }).count(), 0, "late step 8 reply is discarded");
  await page.getByTestId("ar-placement").filter({ hasText: "Step 9:" }).waitFor({ timeout: 15000 });
  const stepNine = await page.locator("[aria-label='All steps'] [aria-current='step']").first().getAttribute("aria-label");
  const beforeRotate = await page.getByTestId("ar-placement").getAttribute("transform");
  await say("rotate it");
  assert.notEqual(await page.getByTestId("ar-placement").getAttribute("transform"), beforeRotate, "voice rotation changes only the ghost");
  await page.getByRole("button", { name: /AR assistant; drag/ }).click();
  const beforePartCalls = guideCalls;
  await page.getByRole("button", { name: /2\. Round brick 2x2 brown/ }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="AR assistant"] button[aria-pressed="true"]')?.textContent?.includes("Round brick"));
  for (let i = 0; guideCalls === beforePartCalls && i < 150; i++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(guideCalls > beforePartCalls, "part chip starts a fresh request for this step");
  assert.ok(guideParts.at(-1)?.toLowerCase().includes("round brick"), `part chip grounds the selected part: ${JSON.stringify(guideParts)}`);
  assert.equal(await page.locator("[aria-label='All steps'] [aria-current='step']").first().getAttribute("aria-label"), stepNine);
  await say("hide guide");
  await page.locator('svg[aria-label="2D AR guide overlay"]').waitFor({ state: "hidden" });
  assert.equal(await page.getByTestId("ar-toggle").getAttribute("aria-pressed"), "false");
  await say("show guide");
  assert.equal(await page.getByTestId("ar-toggle").getAttribute("aria-pressed"), "true");
  assert.deepEqual(errors, []);
  console.log(`AR + voice browser test passed: ${guideCalls} mocked guide calls`);
} finally {
  await browser.close();
}
