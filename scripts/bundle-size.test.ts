import { expect, test } from "bun:test";
import { CORE_BUDGET_BYTES, measureCore } from "./bundle-size";

test("the core stays under 6 KB min+gz", async () => {
  const size = await measureCore();
  console.log(`core: ${size.minified} B min, ${size.gzipped} B min+gz`);
  expect(size.gzipped).toBeLessThan(CORE_BUDGET_BYTES);
});
