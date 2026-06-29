import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

// rpc.call 모킹 — pipeline 의 level.apply / level.save.file 를 제어한다.
vi.mock("../src/rpc/client.js", () => ({ call: vi.fn() }));
import { call } from "../src/rpc/client.js";

import { decode } from "../src/ovdrjm/codec.js";
import { findByGuid, type OvdrjmDoc } from "../src/ovdrjm/document.js";
import { applyWrite, WriteError } from "../src/ovdrjm/pipeline.js";
import { resolveOvdrjmPath } from "../src/ovdrjm/document.js";
import { partProperties } from "../src/ovdrjm/schemas.js";
import { insertInstance } from "../src/scene/insert.js";

const mockCall = vi.mocked(call);
const here = dirname(fileURLToPath(import.meta.url));
const WS = "00000000000000000000000000000002"; // empty-world 의 Workspace
const GUID = "A".repeat(32);

function makeWorld(): { dir: string; ovdrjmPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "world-"));
  copyFileSync(join(here, "fixtures", "empty-world.ovdrjm"), join(dir, "W.ovdrjm"));
  writeFileSync(join(dir, "W.umap"), ""); // resolveOvdrjmPath 는 .umap 을 요구
  return { dir, ovdrjmPath: join(dir, "W.ovdrjm") };
}
function loadDoc(path: string): OvdrjmDoc {
  return JSON.parse(decode(readFileSync(path))) as OvdrjmDoc;
}
const addPart = (doc: OvdrjmDoc) =>
  insertInstance(doc, WS, "Part", "P", partProperties.parse({ Size: { X: 1, Y: 1, Z: 1 } }), GUID);

beforeEach(() => {
  mockCall.mockReset();
});

describe("applyWrite — happy path", () => {
  it("creates the part and calls apply+save", async () => {
    mockCall.mockResolvedValue({ success: true });
    const { dir, ovdrjmPath } = makeWorld();

    const outcome = await applyWrite(addPart, { cwd: dir });

    expect(outcome.guid).toBe(GUID);
    const methods = mockCall.mock.calls.map((c) => c[0]);
    expect(methods).toEqual(["level.apply", "level.save.file"]);
    const doc = loadDoc(ovdrjmPath);
    expect(findByGuid(doc.Root, GUID)).toBeDefined();
    expect(doc.MapObjectKeyIndex).toBe(3);
  });
});

describe("applyWrite — pre-write 실패는 복원/RPC 없음", () => {
  it("modify 실패 → abort, apply/save 미호출, 파일 불변", async () => {
    mockCall.mockResolvedValue({ success: true });
    const { dir, ovdrjmPath } = makeWorld();
    const before = readFileSync(ovdrjmPath);

    await expect(applyWrite(() => { throw new Error("bad parent"); }, { cwd: dir }))
      .rejects.toMatchObject({ name: "WriteError", stage: "modify", rollbackComplete: true });
    expect(mockCall).not.toHaveBeenCalled();
    expect(readFileSync(ovdrjmPath)).toEqual(before);
  });

  it("validate 실패(중복 GUID) → abort, RPC 미호출", async () => {
    mockCall.mockResolvedValue({ success: true });
    const { dir } = makeWorld();
    const dupInsert = (doc: OvdrjmDoc) =>
      insertInstance(doc, WS, "Part", "Dup", {}, "00000000000000000000000000000001"); // Root 와 동일 GUID

    await expect(applyWrite(dupInsert, { cwd: dir }))
      .rejects.toMatchObject({ stage: "validate" });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("conflict(외부 수정) → abort, 외부 변경 보존(복원 안 함)", async () => {
    mockCall.mockResolvedValue({ success: true });
    const { dir, ovdrjmPath } = makeWorld();
    const external = Buffer.from('{"FileVersion":9,"MapObjectKeyIndex":99,"Root":{"InstanceType":"DataModel","ActorGuid":"X","ObjectKey":1,"Name":"DataModel","LuaChildren":[]}}');

    // modify 도중 외부 프로세스가 파일을 바꾼 상황을 모사
    const racingModify = (doc: OvdrjmDoc) => {
      writeFileSync(ovdrjmPath, external);
      return addPart(doc);
    };
    await expect(applyWrite(racingModify, { cwd: dir }))
      .rejects.toMatchObject({ stage: "conflict", rollbackComplete: true });
    expect(mockCall).not.toHaveBeenCalled();
    expect(readFileSync(ovdrjmPath)).toEqual(external); // 외부 변경 그대로 보존
  });
});

describe("applyWrite — post-write 실패는 롤백", () => {
  it("level.apply 실패 → 롤백 완료, 파일 원복", async () => {
    let applyCount = 0;
    mockCall.mockImplementation(async (method: string) => {
      if (method === "level.apply") { applyCount++; if (applyCount === 1) throw new Error("apply boom"); }
      return { success: true };
    });
    const { dir, ovdrjmPath } = makeWorld();
    const before = readFileSync(ovdrjmPath);

    await expect(applyWrite(addPart, { cwd: dir }))
      .rejects.toMatchObject({ stage: "apply", rollbackComplete: true });
    // 파일 원복 + 파트 제거
    expect(readFileSync(ovdrjmPath)).toEqual(before);
    expect(findByGuid(loadDoc(ovdrjmPath).Root, GUID)).toBeUndefined();
  });

  it("level.save.file 실패 → 롤백 완료", async () => {
    mockCall.mockImplementation(async (method: string) => {
      if (method === "level.save.file") throw new Error("save boom");
      return { success: true };
    });
    const { dir, ovdrjmPath } = makeWorld();
    const before = readFileSync(ovdrjmPath);

    await expect(applyWrite(addPart, { cwd: dir }))
      .rejects.toMatchObject({ stage: "save", rollbackComplete: true });
    expect(readFileSync(ovdrjmPath)).toEqual(before);
  });

  it("롤백 중 level.apply 도 실패하면 rollbackComplete=false", async () => {
    mockCall.mockImplementation(async (method: string) => {
      if (method === "level.apply") throw new Error("apply always fails");
      return { success: true };
    });
    const { dir } = makeWorld();

    const err = await applyWrite(addPart, { cwd: dir }).catch((e) => e as WriteError);
    expect(err).toBeInstanceOf(WriteError);
    expect(err.stage).toBe("apply");
    expect(err.rollbackComplete).toBe(false); // 파일은 복원됐지만 씬 되돌리기 실패
  });
});
