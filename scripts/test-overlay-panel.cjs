const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto("http://127.0.0.1:5123/?panel=live-hub", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Overlay")');
  await page.waitForTimeout(1500);
  const header = await page.locator("h1").first().innerText().catch(() => "");
  const overlaySettings = await page.locator("#overlay-settings").count();
  const salida = await page.locator("text=Salida visual").count();
  const stageHtml = await page.locator(".workspace-stage").innerHTML().catch(() => "");
  console.log(JSON.stringify({ header, overlaySettings, salida, stageLen: stageHtml.length, stagePreview: stageHtml.slice(0, 400) }));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
