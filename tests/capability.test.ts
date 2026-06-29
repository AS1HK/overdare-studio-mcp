import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/rpc/client.js", () => ({ call: vi.fn() }));
import { call } from "../src/rpc/client.js";
import { RpcError, RpcTransportError } from "../src/rpc/errors.js";
import { _resetCapabilityCache, getCapabilities, isSupported } from "../src/capability/capabilities.js";
import { unsupportedResult } from "../src/tools/result.js";

const mockCall = vi.mocked(call);

beforeEach(() => {
  mockCall.mockReset();
  _resetCapabilityCache();
});

describe("Capability Layer — probe 분류", () => {
  it("-32002 는 미지원, 그 외 에러/성공은 지원", async () => {
    mockCall.mockImplementation(async (method: string) => {
      if (method === "asset_drawer.import") throw new RpcError(-32603, "Internal error"); // 지원
      if (method === "asset_manager.image.import") throw new RpcError(-32002, "Method not found"); // 미지원
      if (method === "action_sequencer_service.apply_json") return { ok: true }; // 지원
      throw new Error("unexpected");
    });

    const caps = await getCapabilities();
    expect(caps.methods["asset_drawer.import"].supported).toBe(true);
    expect(caps.methods["asset_manager.image.import"]).toMatchObject({ supported: false, probe: "not-found" });
    expect(caps.methods["action_sequencer_service.apply_json"].supported).toBe(true);
    expect(caps.probedAt).not.toBeNull();
  });

  it("level.publish 는 probe 하지 않고 낙관적 supported(skipped)", async () => {
    mockCall.mockRejectedValue(new RpcError(-32603, "x"));
    const caps = await getCapabilities();
    expect(caps.methods["level.publish"]).toMatchObject({ supported: true, probe: "skipped" });
  });

  it("Studio 미연결(transport error) 이면 낙관적 supported + probedAt=null(캐시 안 함)", async () => {
    mockCall.mockRejectedValue(new RpcTransportError("Studio down"));
    const caps = await getCapabilities();
    expect(caps.probedAt).toBeNull();
    expect(await isSupported("asset_drawer.import")).toBe(true); // 낙관적
  });

  it("결과를 캐시한다(두 번째 호출은 재-probe 안 함)", async () => {
    mockCall.mockRejectedValue(new RpcError(-32603, "x"));
    await getCapabilities();
    const callsAfterFirst = mockCall.mock.calls.length;
    await getCapabilities();
    expect(mockCall.mock.calls.length).toBe(callsAfterFirst); // 캐시 적중
  });
});

describe("Capability Layer — 미지원 계약 응답", () => {
  it("unsupportedResult 는 Stable Tool Contract 형태(success:false, stage:capability)", () => {
    const r = unsupportedResult("studio_publish", "level.publish");
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({
      success: false,
      operation: "studio_publish",
      error: { stage: "capability", message: expect.stringContaining("level.publish") },
      metadata: { capability: "level.publish", supported: false },
    });
  });
});
