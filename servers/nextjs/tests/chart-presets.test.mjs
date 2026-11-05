import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

let insertElements;
let temporaryDirectory;

test.before(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "presenton-charts-"));
  const entryFile = path.join(temporaryDirectory, "entry.ts");
  const outputFile = path.join(temporaryDirectory, "bundle.mjs");
  await writeFile(
    entryFile,
    `export { createChartInsertElements } from ${JSON.stringify(path.resolve("components/slide-editor/insert/insert-elements.ts"))};`,
  );
  await build({
    entryPoints: [entryFile],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    tsconfig: path.resolve("tsconfig.json"),
    logLevel: "silent",
  });
  insertElements = await import(
    `${pathToFileURL(outputFile).href}?cache=${Date.now()}`
  );
});

test.after(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("inserts the editable naloxone survey as a four-series column chart", () => {
  const [chart] = insertElements.createChartInsertElements("naloxone-survey");

  assert.equal(chart.type, "chart");
  assert.equal(chart.chart_type, "bar");
  assert.equal(chart.legend, true);
  assert.equal(chart.series.length, 4);
  assert.deepEqual(chart.categories, [
    "I am confident in my abilities to\nprescribe naloxone",
    "Naloxone is a safe and effective\nmedication",
    "Long-term, high-dose opioids can\nlead to potential harm",
  ]);
  assert.deepEqual(
    chart.series.map(({ name, values }) => ({ name, values })),
    [
      { name: "Strongly Disagree", values: [10, 5, 8] },
      { name: "Neutral", values: [50, 10, 12] },
      { name: "Agree", values: [30, 30, 45] },
      { name: "Strongly Agree", values: [0, 50, 35] },
    ],
  );
  assert.equal(chart.colors.length, chart.series.length);
  assert.equal(chart.data_labels, null);
});
