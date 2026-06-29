import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decode, encode, serialize } from "../src/ovdrjm/codec.js";
import { newInstanceNode, findByGuid, randomActorGuid, type OvdrjmDoc } from "../src/ovdrjm/document.js";
import { createBackup, restoreBackup } from "../src/ovdrjm/backup.js";
import { validateDocument } from "../src/ovdrjm/validate.js";
import { partProperties } from "../src/ovdrjm/schemas.js";
import { insertInstance } from "../src/scene/insert.js";

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n: string) => join(here, "fixtures", n);
const loadDoc = (n: string): OvdrjmDoc => JSON.parse(decode(readFileSync(fix(n)))) as OvdrjmDoc;

describe("ovdrjm/codec", () => {
  it("decode→encode is byte-exact (UTF-8 fixture)", () => {
    const buf = readFileSync(fix("empty-world.ovdrjm"));
    expect(encode(decode(buf), buf)).toEqual(buf);
  });

  it("decode→encode is byte-exact (synthetic UTF-16LE w/ BOM)", () => {
    const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('{"a":1}', "utf16le")]);
    expect(encode(decode(u16), u16)).toEqual(u16);
  });

  it("serialize matches JSON.stringify(doc,null,2)+\\n", () => {
    const doc = { b: 1, a: [1, 2] };
    expect(serialize(doc)).toBe(`${JSON.stringify(doc, null, 2)}\n`);
  });
});

describe("ovdrjm/document", () => {
  it("randomActorGuid is 32 upper-hex", () => {
    expect(randomActorGuid()).toMatch(/^[0-9A-F]{32}$/);
  });

  it("randomActorGuid is deterministic with injected rand", () => {
    expect(randomActorGuid(() => 0)).toBe("0".repeat(32));
  });

  it("newInstanceNode field order: InstanceType, ActorGuid, ObjectKey, Name, ...props", () => {
    const doc = loadDoc("empty-world.ovdrjm");
    const node = newInstanceNode("Part", "X", { Size: { X: 1, Y: 1, Z: 1 } }, doc, "F".repeat(32));
    expect(Object.keys(node)).toEqual(["InstanceType", "ActorGuid", "ObjectKey", "Name", "Size"]);
    expect(node.ObjectKey).toBe(3); // MapObjectKeyIndex 2 → 3
    expect(doc.MapObjectKeyIndex).toBe(3);
  });
});

describe("GOLDEN: create_part == expected-create-part.ovdrjm (semantic)", () => {
  it("inserting a Part reproduces the expected document", () => {
    const doc = loadDoc("empty-world.ovdrjm");
    const props = partProperties.parse({
      Size: { X: 4, Y: 1, Z: 4 },
      Color: { R: 120, G: 200, B: 120 },
      Material: "Plastic",
    });
    insertInstance(doc, "00000000000000000000000000000002", "Part", "MyPart", props, "A".repeat(32));

    const expected = loadDoc("expected-create-part.ovdrjm");
    expect(doc).toEqual(expected); // 의미적(deep) 동일
  });

  it("validates clean after insert", () => {
    const doc = loadDoc("empty-world.ovdrjm");
    insertInstance(doc, "00000000000000000000000000000002", "Part", "P", partProperties.parse({}), "B".repeat(32));
    expect(validateDocument(doc).ok).toBe(true);
  });
});

describe("ovdrjm/validate", () => {
  it("flags duplicate ActorGuid", () => {
    const doc = loadDoc("empty-world.ovdrjm");
    findByGuid(doc.Root, "00000000000000000000000000000002")!.LuaChildren!.push({
      InstanceType: "Part", ActorGuid: "00000000000000000000000000000001", ObjectKey: 9, Name: "Dup",
    });
    const r = validateDocument(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/duplicate ActorGuid/);
  });

  it("flags MapObjectKeyIndex < max ObjectKey", () => {
    const doc = loadDoc("empty-world.ovdrjm");
    doc.MapObjectKeyIndex = 0;
    expect(validateDocument(doc).ok).toBe(false);
  });
});

describe("ovdrjm/backup", () => {
  it("restoreBackup brings the file back byte-for-byte", () => {
    const dir = mkdtempSync(join(tmpdir(), "ovdrjm-"));
    const file = join(dir, "w.ovdrjm");
    copyFileSync(fix("empty-world.ovdrjm"), file);
    const original = readFileSync(file);

    const backup = createBackup([file]);
    writeFileSync(file, Buffer.from("CORRUPTED"));
    expect(readFileSync(file).toString()).toBe("CORRUPTED");

    restoreBackup(backup);
    expect(readFileSync(file)).toEqual(original);
  });
});
