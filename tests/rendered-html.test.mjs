import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /rel=["']apple-touch-icon["'][^>]*href=["']\/apple-touch-icon-thoughtful\.png["']/i);
  assert.doesNotMatch(html, /rel=["']manifest["']/i);
  assert.doesNotMatch(html, /name=["']apple-mobile-web-app-capable["']/i);
});

test("makes the whole compact results card interactive", async () => {
  const pageUrl = new URL("../app/page.tsx", import.meta.url);
  const source = await readFile(pageUrl, "utf8");

  assert.match(source, /<button[\s\S]*?className="home-progress-card"[\s\S]*?aria-label="Открыть подробные результаты и карту знаний"/);
  assert.doesNotMatch(source, /className="hero-visual"/);
  assert.match(source, /className="welcome-visual"/);
  assert.match(source, /const STORAGE_KEY = "umnozhayka-progress-v1"/);
  assert.match(source, /const STORAGE_BACKUP_KEY = "umnozhayka-progress-backup-v1"/);
});

test("ships every shortcut icon at its declared PNG size", async () => {
  const expectedSizes = new Map([
    ["favicon-thoughtful-32.png", 32],
    ["apple-touch-icon-thoughtful.png", 180],
    ["icon-thoughtful-192.png", 192],
    ["icon-thoughtful-512.png", 512],
  ]);

  for (const [fileName, expectedSize] of expectedSizes) {
    const fileUrl = new URL(`../public/${fileName}`, import.meta.url);
    const png = await readFile(fileUrl);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), expectedSize, `${fileName} width`);
    assert.equal(png.readUInt32BE(20), expectedSize, `${fileName} height`);
  }
});
