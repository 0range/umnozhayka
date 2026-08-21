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
  assert.match(html, /rel=["']manifest["'][^>]*href=["']\/manifest\.webmanifest["']/i);
  assert.match(html, /rel=["']apple-touch-icon["'][^>]*href=["']\/apple-touch-icon\.png["']/i);
});

test("makes the whole compact results card interactive", async () => {
  const pageUrl = new URL("../app/page.tsx", import.meta.url);
  const source = await readFile(pageUrl, "utf8");

  assert.match(source, /<button[\s\S]*?className="home-progress-card"[\s\S]*?aria-label="Открыть подробные результаты и карту знаний"/);
  assert.doesNotMatch(source, /className="hero-visual"/);
});

test("publishes an installable manifest without changing the app origin", async () => {
  const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.name, "Умножайка — таблица умножения");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("ships every app icon at its declared PNG size", async () => {
  const expectedSizes = new Map([
    ["favicon-32.png", 32],
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
  ]);

  for (const [fileName, expectedSize] of expectedSizes) {
    const fileUrl = new URL(`../public/${fileName}`, import.meta.url);
    const png = await readFile(fileUrl);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), expectedSize, `${fileName} width`);
    assert.equal(png.readUInt32BE(20), expectedSize, `${fileName} height`);
  }
});
