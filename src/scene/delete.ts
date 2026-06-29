import { findByGuid, removeByGuid, type OvdrjmDoc } from "../ovdrjm/document.js";
import { serviceClasses } from "../ovdrjm/schemas.js";
import type { WriteOutcome } from "../ovdrjm/pipeline.js";

/**
 * 인스턴스를 삭제한다.
 * - 자식 포함: 노드를 제거하면 그 서브트리(LuaChildren)도 함께 사라진다.
 * - 존재하지 않는 GUID 는 에러.
 * - 서비스(싱글톤)는 삭제할 수 없다.
 */
export function deleteInstance(doc: OvdrjmDoc, guid: string): WriteOutcome {
  const target = findByGuid(doc.Root, guid);
  if (!target) throw new Error(`Instance not found for GUID: ${guid}`);
  if (typeof target.InstanceType === "string" && serviceClasses.has(target.InstanceType)) {
    throw new Error(`Cannot delete a Service instance: ${target.InstanceType}`);
  }
  const name = String(target.Name);
  if (!removeByGuid(doc.Root, guid)) {
    throw new Error(`Failed to remove instance: ${guid}`);
  }
  return { label: name, removed: [name], guid };
}
