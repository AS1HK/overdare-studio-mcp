import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

// rpc.call 만 모킹 — 실제 pipeline(applyWrite)을 그대로 태워 계약을 검증한다.
vi.mock("../src/rpc/client.js", () => ({ call: vi.fn() }));
import { call } from "../src/rpc/client.js";

import { partProperties } from "../src/ovdrjm/schemas.js";
import { insertInstance } from "../src/scene/insert.js";
import { readResult, runWriteTool } from "../src/tools/result.js";

const mockCall = vi.mocked(call);
const here = dirname(fileURLToPath(import.meta.url));
const WS = "00000000000000000000000000000002";

function makeWorld(): string {
  const dir = mkdtempSync(join(tmpdir(), "tools-"));
  copyFileSync(join(here, "fixtures", "empty-world.ovdrjm"), join(dir, "W.ovdrjm"));
  writeFileSync(join(dir, "W.umap"), "");
  return dir;
}

beforeEach(() => mockCall.mockReset());

describe("Tool Contract — readResult", () => {
  it("read 도구는 success/operation/affected[]/warnings[]/data 를 가진다", () => {
    const r = readResult("studio_browse", [{ guid: "G" }], "text");
    expect(r.isError).toBe(false);
    expect(r.content[0]).toEqual({ type: "text", text: "text" });
    expect(r.structuredContent).toMatchObject({
      success: true,
      operation: "studio_browse",
      affected: [],
      warnings: [],
      data: [{ guid: "G" }],
    });
  });
});

describe("Tool Contract — runWriteTool", () => {
  it("성공 시 success:true + affected(guid) + isError:false", async () => {
    mockCall.mockResolvedValue({ success: true });
    const dir = makeWorld();
    const props = partProperties.parse({ Size: { X: 1, Y: 1, Z: 1 } });

    const r = await runWriteTool(
      "studio_create_part",
      (doc) => insertInstance(doc, WS, "Part", "P", props, "A".repeat(32)),
      (o) => ({ text: "ok", affected: [{ guid: o.guid!, name: "P", class: "Part" }], metadata: { parentGuid: WS } }),
      { cwd: dir },
    );

    expect(r.isError).toBe(false);
    expect(r.structuredContent).toMatchObject({
      success: true,
      operation: "studio_create_part",
      affected: [{ guid: "A".repeat(32), name: "P", class: "Part" }],
      metadata: { parentGuid: WS },
    });
  });

  it("실패 시 throw 없이 success:false + stage + rollbackComplete + isError:true", async () => {
    mockCall.mockResolvedValue({ success: true });
    const dir = makeWorld();

    // modify 가 던지면 pipeline 은 WriteError("modify") 로 abort (pre-write → rollbackComplete=true)
    const r = await runWriteTool(
      "studio_create_part",
      () => { throw new Error("bad parent"); },
      () => ({ text: "", affected: [] }),
      { cwd: dir },
    );

    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({
      success: false,
      operation: "studio_create_part",
      affected: [],
      rollbackComplete: true,
      error: { stage: "modify", message: expect.stringContaining("bad parent") },
    });
  });
});
