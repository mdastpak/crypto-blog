import { BackendError, isNotFound } from "./errors";

describe("BackendError across bundles", () => {
  it("recognizes an error made by another copy of the module", async () => {
    vi.resetModules();
    const other = await import("./errors");
    const error = new other.BackendError("not_found", 404, "Not found");
    expect(other.BackendError).not.toBe(BackendError);
    expect(error instanceof BackendError).toBe(true);
    expect(isNotFound(error)).toBe(true);
    expect(new Error("x") instanceof BackendError).toBe(false);
  });
});
