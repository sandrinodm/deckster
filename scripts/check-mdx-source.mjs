/**
 * Checks src/components/deck/mdx-source.ts, which the coverage check, the sync and the Markdown
 * twins all read the pages with:
 *
 *     npm run check:mdx-source
 *
 * - A component inside JavaScript (an expression, a prop value, a spread, an export) fails with
 *   its page and line; a tag in a comment or a code span, or an HTML element in an expression,
 *   doesn't.
 * - literalValue decodes JavaScript literals (escapes included) and rejects everything else.
 */
import { componentUsesIn, literalValue, MdxSourceError } from "../src/components/deck/mdx-source.ts";

const failures = [];
const expect = (label, ok, detail) => {
  if (!ok) failures.push(`${label}: ${detail}`);
};

const REJECTED = [
  ['{true && <PropsTable of="BarChart" />}', "probe.mdx:1: <PropsTable> inside an expression"],
  ['Text {cond ? <UiShot name="presenter" alt="x" /> : null} more', "probe.mdx:1: <UiShot> inside an expression"],
  ['<Tabs icon={<UiShot name="help" alt="y" />} />', "probe.mdx:1: <UiShot> inside the icon expression of <Tabs>"],
  ['<Box {...{ a: <PropsTable of="X" /> }} />', "probe.mdx:1: <PropsTable> inside a spread on <Box>"],
  ['export const shot = <UiShot name="tools" alt="z" />\n\n{shot}', "probe.mdx:1: <UiShot> inside an import or export"],
  ['a\n\n{[1, 2].map(() => (\n  <div>\n    <CliCommand name="lint" />\n  </div>\n))}', "probe.mdx:5: <CliCommand> inside an expression"],
];
for (const [source, message] of REJECTED) {
  try {
    componentUsesIn(source, "probe.mdx");
    expect(JSON.stringify(source), false, "was accepted");
  } catch (error) {
    expect(JSON.stringify(source), error instanceof MdxSourceError && error.message.includes(message), String(error));
  }
}

const ACCEPTED = [
  ['{/* <PropsTable of="BarChart" /> */}', []],
  ["{true && <br />}", []],
  ['`<PropsTable of="BarChart" />` in code', []],
  ['<PropsTable of="BarChart" />\n\n<UiShot name="presenter" alt=\'"No budgets"\' />', ["PropsTable", "UiShot"]],
];
for (const [source, names] of ACCEPTED) {
  try {
    const found = componentUsesIn(source, "probe.mdx").map((use) => use.name);
    expect(JSON.stringify(source), JSON.stringify(found) === JSON.stringify(names), `found ${JSON.stringify(found)}`);
  } catch (error) {
    expect(JSON.stringify(source), false, String(error));
  }
}

const LITERALS = [
  ["'Bar\\u0043hart'", "BarChart"],
  ['"\\x41"', "A"],
  ["`a\\nb`", "a\nb"],
  ['"BarChart"', "BarChart"],
  ["-1.5", -1.5],
  ["0x10", 16],
  ["true", true],
  ["false", false],
  ['"a" + "b"', undefined],
  ["`${x}`", undefined],
  ["x", undefined],
  ["[1]", undefined],
  ["null", undefined],
  ["'a' 'b'", undefined],
  ['"unterminated', undefined],
  ["1n", undefined],
  ["-true", undefined],
];
for (const [source, value] of LITERALS) {
  const got = literalValue(source);
  expect(`literalValue(${source})`, Object.is(got, value), `got ${JSON.stringify(got)}, expected ${JSON.stringify(value)}`);
}

if (failures.length > 0) {
  console.error(`mdx-source.ts checks failed:\n  ${failures.join("\n  ")}`);
  process.exitCode = 1;
} else {
  console.log(`mdx-source.ts: ${REJECTED.length + ACCEPTED.length} walker cases and ${LITERALS.length} literals as expected.`);
}
