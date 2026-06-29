import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { IMAGE_EXTENSIONS, JSON_EXTENSIONS, isWithin, PathSecurityError, validatePath } from "../src/security/path-guard.js";

describe("path-guard / isWithin (순수)", () => {
  it("같은 경로 / 하위 경로는 within", () => {
    expect(isWithin("/a/b", "/a/b")).toBe(true);
    expect(isWithin("/a/b", "/a/b/c/d.png")).toBe(true);
  });
  it("상위/형제/완전 다른 경로는 밖", () => {
    expect(isWithin("/a/b", "/a")).toBe(false);
    expect(isWithin("/a/b", "/a/bc")).toBe(false); // prefix 함정
    expect(isWithin("/a/b", "/x/y")).toBe(false);
  });
});

describe("path-guard / validatePath", () => {
  function world() {
    const root = mkdtempSync(join(tmpdir(), "pg-root-"));
    const sub = join(root, "assets");
    mkdirSync(sub);
    const img = join(sub, "ok.png");
    writeFileSync(img, "PNG");
    return { root, sub, img };
  }

  it("경계 안 + 확장자 OK → realpath 반환", () => {
    const { root, img } = world();
    const out = validatePath(img, { allowedRoots: [root], extensions: IMAGE_EXTENSIONS });
    expect(out.toLowerCase()).toContain("ok.png");
  });

  it("빈 경로 → empty", () => {
    expect(() => validatePath("", { allowedRoots: ["/"] })).toThrow(PathSecurityError);
    try { validatePath("  "); } catch (e) { expect((e as PathSecurityError).reason).toBe("empty"); }
  });

  it("없는 파일 → not-found", () => {
    const { root } = world();
    try { validatePath(join(root, "nope.png"), { allowedRoots: [root] }); }
    catch (e) { expect((e as PathSecurityError).reason).toBe("not-found"); }
  });

  it("디렉터리 → not-file", () => {
    const { root, sub } = world();
    try { validatePath(sub, { allowedRoots: [root] }); }
    catch (e) { expect((e as PathSecurityError).reason).toBe("not-file"); }
  });

  it("경계 밖 절대경로 → outside-boundary", () => {
    const { img } = world();
    const otherRoot = mkdtempSync(join(tmpdir(), "pg-other-"));
    try { validatePath(img, { allowedRoots: [otherRoot] }); }
    catch (e) { expect((e as PathSecurityError).reason).toBe("outside-boundary"); }
  });

  it("Path Traversal (../) → outside-boundary 또는 not-found", () => {
    const { root, sub } = world();
    // sub 를 루트로 두고 ../ 로 탈출 시도
    try {
      validatePath(join(sub, "..", "..", "etc-passwd"), { allowedRoots: [sub] });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PathSecurityError);
      expect(["outside-boundary", "not-found"]).toContain((e as PathSecurityError).reason);
    }
  });

  it("잘못된 확장자 → bad-extension", () => {
    const { root, sub } = world();
    const txt = join(sub, "evil.txt");
    writeFileSync(txt, "x");
    try { validatePath(txt, { allowedRoots: [root], extensions: IMAGE_EXTENSIONS }); }
    catch (e) { expect((e as PathSecurityError).reason).toBe("bad-extension"); }
  });

  it("JSON 확장자: .json 통과 / .txt 거부 (action sequencer)", () => {
    const { root, sub } = world();
    const okJson = join(sub, "seq.json");
    writeFileSync(okJson, "{}");
    expect(validatePath(okJson, { allowedRoots: [root], extensions: JSON_EXTENSIONS })).toContain("seq.json");
    const bad = join(sub, "seq.txt");
    writeFileSync(bad, "{}");
    try { validatePath(bad, { allowedRoots: [root], extensions: JSON_EXTENSIONS }); throw new Error("should throw"); }
    catch (e) { expect((e as PathSecurityError).reason).toBe("bad-extension"); }
  });

  it("Symlink escape → outside-boundary (심링크 생성 불가 환경은 skip)", () => {
    const { root, sub } = world();
    const outside = mkdtempSync(join(tmpdir(), "pg-secret-"));
    const secret = join(outside, "secret.png");
    writeFileSync(secret, "SECRET");
    const link = join(sub, "link.png");
    let linked = false;
    try { symlinkSync(secret, link); linked = true; } catch { /* Windows 권한 등 → skip */ }
    if (!linked) return;
    // 경계(root) 안의 심링크지만 실제 대상은 밖 → realpath 후 경계검사로 차단
    try {
      validatePath(link, { allowedRoots: [root], extensions: IMAGE_EXTENSIONS });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as PathSecurityError).reason).toBe("outside-boundary");
    }
  });
});
