import { expect, test } from "bun:test";
import { MEASURED, measureImport } from "./bundle-size";

for (const [label, { names, entry, budget }] of Object.entries(MEASURED))
  test(`${label} stays under ${budget / 1024} KB min+gz`, async () => {
    const size = await measureImport(names, entry);
    console.log(`${label}: ${size.minified} B min, ${size.gzipped} B min+gz`);
    expect(size.gzipped).toBeLessThan(budget);
  });
