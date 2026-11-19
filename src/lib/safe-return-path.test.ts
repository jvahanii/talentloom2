import { test } from "node:test";
import { strictEqual } from "node:assert";
import { safeReturnPath } from "./safe-return-path";

test("only paths on this site are accepted", () => {
  strictEqual(safeReturnPath("/apply"), "/apply");
  strictEqual(safeReturnPath("/apply/position/abc?x=1"), "/apply/position/abc?x=1");
  const bad = [
    "//evil.example/x",
    String.raw`/\evil.example`,
    "https://evil.example",
    "evil.example",
    "javascript:alert(1)",
    "",
    undefined,
    5,
  ];
  for (const value of bad) strictEqual(safeReturnPath(value), undefined);
});
