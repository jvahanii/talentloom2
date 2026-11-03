import { describe, expect, test } from "bun:test";
import { addMembershipsSchema, assertSuperuser, planMemberships } from "./admin-memberships";

describe("admin organisation assignments", () => {
  test("adds one user to multiple organisations with each organisation's Member title", () => {
    expect(planMemberships("user", ["org-a", "org-b"], [], [
      { id: "title-a", org_id: "org-a" }, { id: "title-b", org_id: "org-b" },
    ])).toEqual([
      { org_id: "org-a", user_id: "user", role: "member", title_id: "title-a" },
      { org_id: "org-b", user_id: "user", role: "member", title_id: "title-b" },
    ]);
  });
  test("preserves existing memberships and ignores duplicate selections", () => {
    expect(planMemberships("user", ["org-a", "org-b", "org-b"], [{ org_id: "org-a" }], [
      { id: "title-b", org_id: "org-b" },
    ])).toEqual([{ org_id: "org-b", user_id: "user", role: "member", title_id: "title-b" }]);
  });
  test("rejects missing organisations or Member titles before any insert", () => {
    expect(() => planMemberships("user", ["org-a", "missing"], [], [{ id: "title-a", org_id: "org-a" }])).toThrow();
  });
  test("only a verified superuser is allowed", () => {
    for (const allowed of [false, null, undefined, "true"]) expect(() => assertSuperuser(allowed)).toThrow();
    expect(() => assertSuperuser(true)).not.toThrow();
  });
  test("validates account and organisation identifiers", () => {
    expect(addMembershipsSchema.safeParse({ userId: "invalid", orgIds: ["invalid"] }).success).toBe(false);
  });
});