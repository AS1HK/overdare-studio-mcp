import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decode } from "../src/ovdrjm/codec.js";
import { findByGuid, type OvdrjmDoc } from "../src/ovdrjm/document.js";
import { updateInstance } from "../src/scene/update.js";
import { deleteInstance } from "../src/scene/delete.js";
import { partPropertiesUpdate } from "../src/ovdrjm/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const loadDoc = (n: string): OvdrjmDoc =>
  JSON.parse(decode(readFileSync(join(here, "fixtures", n)))) as OvdrjmDoc;

const TARGET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01";
const CHILD = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA02";
const WS = "00000000000000000000000000000002";

describe("GOLDEN: update_part == expected-update.ovdrjm (semantic)", () => {
  it("이름 변경 + Color 만 바뀌고 나머지(Size/Anchored/Material/Child)는 보존", () => {
    const doc = loadDoc("before.ovdrjm");
    const props = partPropertiesUpdate.parse({ Color: { R: 200, G: 50, B: 50 } });
    updateInstance(doc, TARGET, { name: "Renamed", properties: props });
    expect(doc).toEqual(loadDoc("expected-update.ovdrjm"));
  });

  it("부분 업데이트는 default 를 주입하지 않는다(CanCollide 등 미생성)", () => {
    const doc = loadDoc("before.ovdrjm");
    updateInstance(doc, TARGET, { properties: partPropertiesUpdate.parse({ Material: "Neon" }) });
    const t = findByGuid(doc.Root, TARGET)!;
    expect(t.Material).toBe("Neon");
    expect("CanCollide" in t).toBe(false); // 안전 개선: 미지정 불린 미주입
    expect(t.Anchored).toBe(true); // 기존 값 보존
  });

  it("없는 GUID 는 에러", () => {
    const doc = loadDoc("before.ovdrjm");
    expect(() => updateInstance(doc, "NOPE", { name: "x" })).toThrow(/not found/);
  });
});

describe("GOLDEN: delete == expected-delete.ovdrjm (semantic)", () => {
  it("Target 삭제 시 자식(Child)도 함께 제거", () => {
    const doc = loadDoc("before.ovdrjm");
    const out = deleteInstance(doc, TARGET);
    expect(out.removed).toEqual(["Target"]);
    expect(doc).toEqual(loadDoc("expected-delete.ovdrjm"));
    expect(findByGuid(doc.Root, CHILD)).toBeUndefined(); // 자식도 사라짐
  });

  it("없는 GUID 삭제는 에러", () => {
    const doc = loadDoc("before.ovdrjm");
    expect(() => deleteInstance(doc, "NOPE")).toThrow(/not found/);
  });

  it("서비스(Workspace)는 삭제 불가", () => {
    const doc = loadDoc("before.ovdrjm");
    expect(() => deleteInstance(doc, WS)).toThrow(/Service/);
  });
});
