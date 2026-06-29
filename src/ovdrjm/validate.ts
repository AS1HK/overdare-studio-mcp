import type { OvdrjmDoc, OvdrjmNode } from "./document.js";

/**
 * .ovdrjm 구조 무결성 검증 — 쓰기를 Studio 에 커밋(level.apply)하기 전 마지막 안전장치.
 * 추측 RPC 없이 파일 구조만 본다: Root 존재, 필수 필드, ActorGuid 중복 없음, ObjectKey 일관성.
 */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateDocument(doc: OvdrjmDoc): ValidationResult {
  const errors: string[] = [];

  if (!doc.Root || typeof doc.Root !== "object") {
    return { ok: false, errors: ["Root object is missing."] };
  }

  const seenGuids = new Set<string>();
  let maxObjectKey = 0;

  const walk = (node: OvdrjmNode, path: string): void => {
    if (typeof node.InstanceType !== "string") errors.push(`${path}: InstanceType missing/invalid`);
    if (typeof node.Name !== "string") errors.push(`${path}: Name missing/invalid`);
    if (typeof node.ActorGuid !== "string") {
      errors.push(`${path}: ActorGuid missing/invalid`);
    } else {
      if (seenGuids.has(node.ActorGuid)) errors.push(`${path}: duplicate ActorGuid ${node.ActorGuid}`);
      seenGuids.add(node.ActorGuid);
    }
    if (typeof node.ObjectKey === "number") maxObjectKey = Math.max(maxObjectKey, node.ObjectKey);
    for (const child of node.LuaChildren ?? []) walk(child, `${path}/${child.Name ?? "?"}`);
  };
  walk(doc.Root, doc.Root.Name ?? "Root");

  if (typeof doc.MapObjectKeyIndex !== "number") {
    errors.push("MapObjectKeyIndex missing/invalid");
  } else if (doc.MapObjectKeyIndex < maxObjectKey) {
    errors.push(`MapObjectKeyIndex (${doc.MapObjectKeyIndex}) < max ObjectKey (${maxObjectKey})`);
  }

  return { ok: errors.length === 0, errors };
}
