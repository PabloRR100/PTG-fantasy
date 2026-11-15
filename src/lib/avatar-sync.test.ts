import { describe, expect, test, vi } from "vitest";
import { syncAvatar } from "@/lib/avatar-sync";

const GOOD = "https://lh3.googleusercontent.com/a/x";
const dbWith = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as never;

describe("syncAvatar", () => {
  test("does nothing when the stored photo is already the session's", async () => {
    const rpc = vi.fn();
    await syncAvatar(dbWith(rpc), GOOD, GOOD);
    expect(rpc).not.toHaveBeenCalled();
  });
  test("saves a changed photo with set_my_avatar", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await syncAvatar(dbWith(rpc), null, GOOD);
    expect(rpc).toHaveBeenCalledWith("set_my_avatar", { p_url: GOOD });
  });
  test("clears the stored photo when the session has none", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await syncAvatar(dbWith(rpc), GOOD, null);
    expect(rpc).toHaveBeenCalledWith("set_my_avatar", { p_url: null });
  });
  test("a failure is logged and never breaks the page", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(syncAvatar(dbWith(rpc), null, GOOD)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("boom"));
    log.mockRestore();
  });
});
