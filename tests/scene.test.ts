import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { filterByClass, postProcess, truncateDepth } from "../src/scene/browse.js";
import { findByGuid, findByName, type BrowseNode } from "../src/scene/guid.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "fixtures", "browse.json"), "utf-8"));
const level = raw.level as BrowseNode[];

describe("scene/guid", () => {
  it("finds a node by guid (recursive)", () => {
    expect(findByGuid(level, "G-PART2")?.name).toBe("Crate");
  });
  it("returns undefined for missing guid", () => {
    expect(findByGuid(level, "NOPE")).toBeUndefined();
  });
  it("finds a node by name (recursive)", () => {
    expect(findByName(level, "Baseplate")?.class).toBe("Part");
  });
});

describe("scene/browse postProcess", () => {
  it("returns full tree from {level:[...]} with no args", () => {
    expect(postProcess(raw, {})).toHaveLength(level.length);
  });

  it("accepts a bare array result too", () => {
    expect(postProcess(level, {})).toHaveLength(level.length);
  });

  it("startGuid scopes to that subtree", () => {
    const out = postProcess(raw, { startGuid: "G-WORKSPACE" });
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Workspace");
  });

  it("returns [] for unknown startGuid", () => {
    expect(postProcess(raw, { startGuid: "NOPE" })).toEqual([]);
  });

  it("classType keeps matching nodes and their ancestors", () => {
    const parts = filterByClass(level, "Part");
    // Workspace(ancestor) 유지, Players 제거
    const names = parts.map((n) => n.name);
    expect(names).toContain("Workspace");
    expect(names).not.toContain("Players");
    // Workspace 하위엔 Part(Baseplate) + Folder(Crate 조상)만, Camera 제거
    const ws = parts.find((n) => n.name === "Workspace")!;
    expect(ws.children!.map((c) => c.name).sort()).toEqual(["Baseplate", "Props"]);
  });

  it("maxDepth=1 strips children", () => {
    const out = truncateDepth(level, 1);
    expect(out.every((n) => n.children === undefined)).toBe(true);
  });

  it("maxDepth=2 keeps one level of children", () => {
    const out = truncateDepth(level, 2);
    const ws = out.find((n) => n.name === "Workspace")!;
    expect(ws.children).toBeDefined();
    const folder = ws.children!.find((c) => c.name === "Props")!;
    expect(folder.children).toBeUndefined();
  });
});
