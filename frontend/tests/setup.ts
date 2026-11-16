import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { webcrypto } from "node:crypto";
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })),
  );
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
