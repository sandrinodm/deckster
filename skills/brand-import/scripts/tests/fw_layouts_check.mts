// usage: node fw_layouts_check.mts <repo root> <workspace> <brand>   (run by test_layouts.py; needs a framework checkout and node)
// Loads brands/<brand> with the framework's own loader (static reader for layouts.ts), then runs the
// layout catalog load (checkBrandLayouts against engine + kit contracts).
import { createRequire } from 'node:module';
const P = `${process.argv[2]}/packages`;
const req = createRequire(`${P}/brand/package.json`);
const { NodeFileSystem } = await import(req.resolve('@effect/platform-node'));
const { Effect } = await import(req.resolve('effect'));
const { loadBrand } = await import(`${P}/brand/src/node/load-brand.ts`);
const { loadLayoutCatalog } = await import(`${P}/vite-plugin/src/layouts/load-layout-catalog.ts`);
const [ws, name] = process.argv.slice(3);
const run = (e: any) => Effect.runPromise(Effect.result(e.pipe(Effect.provide(NodeFileSystem.layer))));
const r: any = await run(loadBrand(ws, name));
if (r._tag !== 'Success') {
  console.log('LOAD FAIL', r.failure.summary ?? r.failure.message);
  console.log(JSON.stringify(r.failure.problems ?? r.failure, null, 1).slice(0, 4000));
  process.exit(1);
}
const brand = r.success;
console.log('loaded layouts:', brand.tokens.layouts.length, brand.layoutsFile);
const c: any = await run(loadLayoutCatalog(undefined, { brand: brand.tokens, layoutsFile: brand.layoutsFile }));
if (c._tag !== 'Success') {
  console.log('CATALOG FAIL', c.failure.message);
  process.exit(2);
}
console.log('catalog ok:', [...c.success.keys()].filter((k: string) => c.success.get(k).fallback).join(','));
