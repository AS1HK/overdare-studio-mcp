import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// rpc.call 과 capability.isSupported 를 모킹 — publish 게이트의 "RPC 호출 0/1"을 검증한다.
vi.mock("../src/rpc/client.js", () => ({ call: vi.fn() }));
vi.mock("../src/capability/capabilities.js", () => ({ isSupported: vi.fn() }));
import { call } from "../src/rpc/client.js";
import { isSupported } from "../src/capability/capabilities.js";
import { executePublish } from "../src/tools/publish.js";

const mockCall = vi.mocked(call);
const mockIsSupported = vi.mocked(isSupported);

const ALL_PASS = { confirm: true, dryRun: false };

beforeEach(() => {
  mockCall.mockReset().mockResolvedValue({ success: true });
  mockIsSupported.mockReset().mockResolvedValue(true); // 기본: capability 지원
  process.env.OVERDARE_ALLOW_PUBLISH = "1"; // 기본: env 허용
});
afterEach(() => {
  delete process.env.OVERDARE_ALLOW_PUBLISH;
});

describe("publish 게이트 — 실제 level.publish 호출 0/1", () => {
  it("capability 없음 → call() 0회", async () => {
    mockIsSupported.mockResolvedValue(false);
    const r = await executePublish({ ...ALL_PASS });
    expect(mockCall).not.toHaveBeenCalled();
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ success: false, error: { stage: "guard" } });
    expect(r.structuredContent.metadata.unmetGates).toContain("capability");
  });

  it("env 없음 → call() 0회", async () => {
    delete process.env.OVERDARE_ALLOW_PUBLISH;
    await executePublish({ ...ALL_PASS });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("confirm 없음 → call() 0회", async () => {
    await executePublish({ confirm: false, dryRun: false });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("dryRun=true → call() 0회 (성공적 미리보기)", async () => {
    const r = await executePublish({ confirm: true, dryRun: true });
    expect(mockCall).not.toHaveBeenCalled();
    expect(r.isError).toBe(false);
    expect(r.structuredContent).toMatchObject({ success: true, metadata: { dryRun: true } });
  });

  it("모든 조건 충족 → call('level.publish') 정확히 1회", async () => {
    const r = await executePublish({ worldName: "W", ...ALL_PASS });
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall.mock.calls[0][0]).toBe("level.publish");
    expect(mockCall.mock.calls[0][1]).toEqual({ worldName: "W" });
    expect(r.structuredContent).toMatchObject({ success: true, metadata: { published: true } });
  });

  it("-32009(유저 취소) → success:false, stage=canceled", async () => {
    const { RpcError } = await import("../src/rpc/errors.js");
    mockCall.mockImplementation(async () => { throw new RpcError(-32009, "canceled"); });
    const r = await executePublish({ ...ALL_PASS });
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(r.structuredContent).toMatchObject({ success: false, error: { stage: "canceled" } });
  });
});
