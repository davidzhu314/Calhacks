import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.E2E_BASE_URL || "http://localhost:3101";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByRole("button", { name: /Start this build/ }).click();
  await page.getByRole("button", { name: /Book 1 of 3/ }).click();
  try {
    await page.waitForURL(/\/build\//, { timeout: 15000 });
  } catch (error) {
    const alert = await page.locator('[role="alert"]').allTextContents();
    throw new Error(`Could not open featured manual at ${page.url()}: ${alert.join(" | ") || "no visible alert"}`, { cause: error });
  }
  await page.getByRole("heading", { name: /Place the brown round 2x2 brick/ }).waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 0);

  await page.getByTestId("ar-toggle").click();
  await page.getByRole("button", { name: /AR assistant; drag/ }).click();
  await page.getByRole("button", { name: "Align / Re-align" }).click();
  await page.getByRole("button", { name: "Tap 1: left end stud on the first green plate in the camera" }).click({ position: { x: 85, y: 450 } });
  await page.getByRole("button", { name: "Tap 2: right end stud on the first green plate in the camera" }).click({ position: { x: 225, y: 450 } });
  const ghost = page.getByLabel("Placement ghost");
  await ghost.locator("rect").waitFor({ timeout: 5000 });
  assert.match(await ghost.textContent(), /Step 1: place here · 2D guide/);
  assert.deepEqual(errors, [], "first-run demo has no uncaught browser errors");
  console.log("Fresh local start passed: featured manual, camera, alignment, and stored ghost");
  await context.close();
} finally {
  await browser.close();
}
