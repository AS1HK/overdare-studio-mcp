import { findByGuid, type OvdrjmDoc } from "../ovdrjm/document.js";
import type { WriteOutcome } from "../ovdrjm/pipeline.js";

/**
 * 기존 인스턴스의 속성/이름을 수정한다.
 * 순서: properties 병합 → name 적용 (name 이 properties 의 Name 보다 우선).
 * 부분 업데이트 — 전달된 필드만 바뀌고 나머지는 보존된다(기본값 없는 스키마 사용).
 */
export function updateInstance(
  doc: OvdrjmDoc,
  guid: string,
  opts: { name?: string; properties?: Record<string, unknown> },
): WriteOutcome {
  const target = findByGuid(doc.Root, guid);
  if (!target) throw new Error(`Instance not found for GUID: ${guid}`);

  if (opts.properties) Object.assign(target, opts.properties);
  if (typeof opts.name === "string") target.Name = opts.name;

  const changed = [
    ...(opts.properties ? Object.keys(opts.properties) : []),
    ...(opts.name !== undefined ? ["Name"] : []),
  ];
  return { label: String(target.Name), added: changed, guid };
}
