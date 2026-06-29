import { findByGuid, newInstanceNode, randomActorGuid, allocObjectKey, type OvdrjmDoc, type OvdrjmNode } from "../ovdrjm/document.js";
import { normalizeScriptSource } from "../ovdrjm/normalize.js";
import type { WriteOutcome } from "../ovdrjm/pipeline.js";

/** 부모 GUID 하위에 인스턴스(Part 등)를 추가한다. */
export function insertInstance(
  doc: OvdrjmDoc,
  parentGuid: string,
  cls: string,
  name: string,
  properties: Record<string, unknown>,
  actorGuid?: string,
): WriteOutcome {
  const parent = findByGuid(doc.Root, parentGuid);
  if (!parent) throw new Error(`Parent instance not found for GUID: ${parentGuid}`);
  const node = newInstanceNode(cls, name, properties, doc, actorGuid);
  (parent.LuaChildren ??= []).push(node);
  return { label: `${parent.Name}/${name}`, added: Object.keys(properties), guid: node.ActorGuid };
}

/** 부모 GUID 하위에 스크립트를 추가한다(소스는 저장용 형식으로 정규화). */
export function insertScript(
  doc: OvdrjmDoc,
  parentGuid: string,
  scriptClass: "Script" | "LocalScript" | "ModuleScript",
  name: string,
  source: string,
  actorGuid?: string,
): WriteOutcome {
  const parent = findByGuid(doc.Root, parentGuid);
  if (!parent) throw new Error(`Parent instance not found for GUID: ${parentGuid}`);
  const node: OvdrjmNode = {
    InstanceType: scriptClass,
    ActorGuid: actorGuid ?? randomActorGuid(),
    ObjectKey: allocObjectKey(doc),
    Name: name,
    Source: normalizeScriptSource(source),
  };
  (parent.LuaChildren ??= []).push(node);
  return { label: `${parent.Name}/${name}`, added: ["Source"], guid: node.ActorGuid };
}
