import { expect, test } from "bun:test";
import { CORE_BUDGET_BYTES, MEASURED, measureImport } from "./bundle-size";

for (const [label, names] of Object.entries(MEASURED))
  test(`the ${label} stays under 6 KB min+gz`, async () => {
    const size = await measureImport(names);
    console.log(`${label}: ${size.minified} B min, ${size.gzipped} B min+gz`);
    expect(size.gzipped).toBeLessThan(CORE_BUDGET_BYTES);
  });
