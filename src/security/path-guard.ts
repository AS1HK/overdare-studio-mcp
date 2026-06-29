import { realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, relative, resolve } from "node:path";
import { config } from "../config.js";

/**
 * 경로 검증 — 파일 경로를 입력받는 도구(asset import 등)의 보안 게이트.
 * Path Traversal / Symlink escape / 경계 이탈 / 잘못된 확장자를 차단한다.
 * (우리 독자 구현 — 외부 코드 미사용)
 */

export class PathSecurityError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

/** candidate 가 root 경계 안인가. 둘 다 절대·정규화 경로 가정. */
export function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export interface PathGuardOptions {
  /** 허용 루트(절대경로). 기본: projectCwd + OVERDARE_ASSET_ROOTS. */
  allowedRoots?: string[];
  /** 허용 확장자(소문자, '.' 포함). 미지정/빈 배열이면 확장자 검사 안 함. */
  extensions?: string[];
}

/** 기본 허용 루트: 프로젝트 폴더 + env OVERDARE_ASSET_ROOTS(플랫폼 구분자). */
function defaultRoots(): string[] {
  const roots = [config.projectCwd];
  const extra = process.env.OVERDARE_ASSET_ROOTS;
  if (extra) roots.push(...extra.split(delimiter).filter(Boolean));
  return roots;
}

function realRoot(r: string): string {
  try {
    return realpathSync(r);
  } catch {
    return resolve(r);
  }
}

/**
 * 입력 경로를 검증하고 **해소된 실제 경로(realpath)** 를 반환한다.
 * 실패하면 PathSecurityError(reason) 을 던진다.
 *  - empty / not-found / not-file / outside-boundary / bad-extension
 */
export function validatePath(inputPath: string, opts: PathGuardOptions = {}): string {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new PathSecurityError("empty", "경로가 비었습니다.");
  }
  const abs = isAbsolute(inputPath) ? inputPath : resolve(config.projectCwd, inputPath);

  let real: string;
  let isFile: boolean;
  try {
    real = realpathSync(abs); // 심볼릭 링크 해소 → 실제 대상
    isFile = statSync(real).isFile();
  } catch {
    throw new PathSecurityError("not-found", `파일을 찾을 수 없습니다: ${inputPath}`);
  }
  if (!isFile) {
    throw new PathSecurityError("not-file", `파일이 아닙니다(디렉터리 등): ${inputPath}`);
  }

  const roots = (opts.allowedRoots ?? defaultRoots()).map(realRoot);
  if (!roots.some((r) => isWithin(r, real))) {
    throw new PathSecurityError("outside-boundary", `허용된 경로(프로젝트 경계) 밖입니다: ${inputPath}`);
  }

  if (opts.extensions && opts.extensions.length > 0) {
    const dot = real.lastIndexOf(".");
    const ext = dot >= 0 ? real.slice(dot).toLowerCase() : "";
    if (!opts.extensions.includes(ext)) {
      throw new PathSecurityError("bad-extension", `허용되지 않은 확장자입니다: "${ext || "(없음)"}"`);
    }
  }
  return real;
}

/** asset_manager.image.import 용 이미지 확장자 화이트리스트(보수적). TODO: Studio 실제 지원 포맷 확인. */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp", ".tga", ".gif", ".webp"];

/** action_sequencer_service.apply_json 용 — JSON 파일만. */
export const JSON_EXTENSIONS = [".json"];
