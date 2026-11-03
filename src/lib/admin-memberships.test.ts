import { describe, test } from "node:test";
import { deepStrictEqual, throws, doesNotThrow, strictEqual } from "node:assert";
import { addMembershipsSchema, assertSuperuser, planMemberships } from "./admin-memberships";

describe("admin organisation assignments", () => {
  test("adds one user to multiple organisations with each organisation's Member title", () => {
    deepStrictEqual(planMemberships("user", ["org-a", "org-b"], [], [
      { id: "title-a", org_id: "org-a" }, { id: "title-b", org_id: "org-b" },
    ]), [
      { org_id: "org-a", user_id: "user", role: "member", title_id: "title-a" },
      { org_id: "org-b", user_id: "user", role: "member", title_id: "title-b" },
    ]);
  });
  test("preserves existing memberships and ignores duplicate selections", () => {
    deepStrictEqual(planMemberships("user", ["org-a", "org-b", "org-b"], [{ org_id: "org-a" }], [
      { id: "title-b", org_id: "org-b" },
    ]), [{ org_id: "org-b", user_id: "user", role: "member", title_id: "title-b" }]);
  });
  test("rejects missing organisations or Member titles before any insert", () => {
    throws(() => planMemberships("user", ["org-a", "missing"], [], [{ id: "title-a", org_id: "org-a" }]));
  });
  test("only a verified superuser is allowed", () => {
    for (const allowed of [false, null, undefined, "true"]) throws(() => assertSuperuser(allowed));
    doesNotThrow(() => assertSuperuser(true));
  });
  test("validates account and organisation identifiers", () => {
    strictEqual(addMembershipsSchema.safeParse({ userId: "invalid", orgIds: ["invalid"] }).success, false);
  });
});