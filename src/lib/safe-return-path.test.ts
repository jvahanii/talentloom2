import { expect, test } from "bun:test";
import { safeReturnPath } from "./safe-return-path";

test("only paths on this site are accepted", () => {
  expect(safeReturnPath("/apply")).toBe("/apply");
  expect(safeReturnPath("/apply/position/abc?x=1")).toBe("/apply/position/abc?x=1");
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
  for (const value of bad) expect(safeReturnPath(value)).toBeUndefined();
});
