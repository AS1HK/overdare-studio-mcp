import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/rpc/client.js", () => ({ call: vi.fn() }));
import { call } from "../src/rpc/client.js";

import { applyRpcMutation } from "../src/ovdrjm/rpc-mutation.js";
import { WriteError } from "../src/ovdrjm/pipeline.js";

const mockCall = vi.mocked(call);
const here = dirname(fileURLToPath(import.meta.url));

function makeWorld(): { dir: string; ovdrjmPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "rpcmut-"));
  copyFileSync(join(here, "fixtures", "empty-world.ovdrjm"), join(dir, "W.ovdrjm"));
  writeFileSync(join(dir, "W.umap"), "");
  return { dir, ovdrjmPath: join(dir, "W.ovdrjm") };
}

beforeEach(() => mockCall.mockReset());

describe("applyRpcMutation", () => {
  it("성공: method 호출 후 level.save.file 로 영속화, 결과 반환", async () => {
    mockCall.mockImplementation(async (m: string) => (m === "asset_drawer.import" ? { ok: 1 } : { success: true }));
    const { dir } = makeWorld();
    const r = await applyRpcMutation("asset_drawer.import", { assetid: "x" }, { cwd: dir, backup: true });
    expect(r).toEqual({ ok: 1 });
    const methods = mockCall.mock.calls.map((c) => c[0]);
    expect(methods).toEqual(["asset_drawer.import", "level.save.file"]);
  });

  it("실패: 백업 복원 + level.apply 로 롤백, WriteError('rpc'), 파일 원복", async () => {
    let applyCount = 0;
    mockCall.mockImplementation(async (m: string) => {
      if (m === "asset_drawer.import") throw new Error("import boom");
      if (m === "level.apply") { applyCount++; }
      return { success: true };
    });
    const { dir, ovdrjmPath } = makeWorld();
    const before = readFileSync(ovdrjmPath);

    const err = await applyRpcMutation("asset_drawer.import", {}, { cwd: dir, backup: true }).catch((e) => e as WriteError);
    expect(err).toBeInstanceOf(WriteError);
    expect(err.stage).toBe("rpc");
    expect(err.rollbackComplete).toBe(true);
    expect(applyCount).toBe(1); // 롤백 시 level.apply 호출
    expect(readFileSync(ovdrjmPath)).toEqual(before); // 원복
  });

  it("backup:false 면 백업/복원 없이 단순 변이(자산 등록류)", async () => {
    mockCall.mockResolvedValue("asset_123");
    const { dir } = makeWorld();
    const r = await applyRpcMutation("asset_manager.image.import", { file: "/x.png" }, { cwd: dir, backup: false });
    expect(r).toBe("asset_123");
    // backup:false → resolveOvdrjmPath/createBackup 안 함, save 는 호출
    expect(mockCall.mock.calls.map((c) => c[0])).toEqual(["asset_manager.image.import", "level.save.file"]);
  });

  it("backup:false 실패 시 rollbackComplete=false (복원 불가)", async () => {
    mockCall.mockImplementation(async (m: string) => {
      if (m === "asset_manager.image.import") throw new Error("nope");
      return { success: true };
    });
    const { dir } = makeWorld();
    const err = await applyRpcMutation("asset_manager.image.import", {}, { cwd: dir, backup: false }).catch((e) => e as WriteError);
    expect(err.stage).toBe("rpc");
    expect(err.rollbackComplete).toBe(false);
  });
});
