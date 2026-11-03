import assert from "node:assert/strict";
import { test } from "node:test";
import { findWorkspace } from "../src/api/workspaces";
import type { WorkspaceMembership } from "../src/api/types";

const ws = (id: string, name: string, slug: string): WorkspaceMembership => ({
  role: "owner",
  workspace: { id, name, slug, logo_url: null, created_at: "2026-01-01" },
});

const list = [ws("id-1", "Acme", "acme"), ws("id-2", "Beta", "beta"), ws("id-3", "Beta", "beta-2")];

test("matches by id, name and slug", () => {
  assert.equal(findWorkspace(list, "id-1").slug, "acme");
  assert.equal(findWorkspace(list, "Acme").id, "id-1");
  assert.equal(findWorkspace(list, "beta-2").id, "id-3");
});

test("ambiguous name fails", () => {
  assert.throws(() => findWorkspace(list, "Beta"), /matches 2 workspaces/);
});

test("unknown workspace fails", () => {
  assert.throws(() => findWorkspace(list, "zzz"), /No workspace matches/);
});
