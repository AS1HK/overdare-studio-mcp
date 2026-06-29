import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decode } from "./codec.js";

export interface OvdrjmNode {
  InstanceType: string;
  ActorGuid: string;
  ObjectKey: number;
  Name: string;
  LuaChildren?: OvdrjmNode[];
  [key: string]: unknown;
}

export interface OvdrjmDoc {
  MapObjectKeyIndex: number;
  Root: OvdrjmNode;
  [key: string]: unknown;
}

/** 프로젝트 폴더의 단일 .umap 을 찾아 형제 .ovdrjm 경로를 돌려준다. */
export function resolveOvdrjmPath(cwd: string): { umapPath: string; ovdrjmPath: string } {
  const umaps = readdirSync(cwd).filter((f) => f.toLowerCase().endsWith(".umap"));
  if (umaps.length === 0) throw new Error(`프로젝트 폴더에 .umap 월드 파일이 없습니다: ${cwd}`);
  if (umaps.length > 1) throw new Error(`프로젝트 폴더에 .umap 이 여러 개입니다(${umaps.join(", ")}). 하나만 두세요.`);
  const umapPath = join(cwd, umaps[0]!);
  const ovdrjmPath = umapPath.replace(/\.umap$/i, ".ovdrjm");
  if (!existsSync(ovdrjmPath)) throw new Error(`${umaps[0]} 에 대응하는 .ovdrjm 파일을 찾을 수 없습니다.`);
  return { umapPath, ovdrjmPath };
}

export function readDocument(ovdrjmPath: string): { buf: Buffer; doc: OvdrjmDoc } {
  const buf = readFileSync(ovdrjmPath);
  const doc = JSON.parse(decode(buf)) as OvdrjmDoc;
  if (!doc.Root || typeof doc.Root !== "object") {
    throw new Error("월드 파일 형식이 올바르지 않습니다(루트 객체 없음).");
  }
  return { buf, doc };
}

/** ActorGuid 로 노드를 재귀 탐색한다(LuaChildren 따라감). */
export function findByGuid(node: OvdrjmNode, guid: string): OvdrjmNode | undefined {
  if (node.ActorGuid === guid) return node;
  for (const child of node.LuaChildren ?? []) {
    const found = findByGuid(child, guid);
    if (found) return found;
  }
  return undefined;
}

/** ActorGuid 로 노드를 트리에서 제거한다(서브트리째). */
export function removeByGuid(root: OvdrjmNode, guid: string): boolean {
  const kids = root.LuaChildren;
  if (kids) {
    const idx = kids.findIndex((c) => c.ActorGuid === guid);
    if (idx !== -1) {
      kids.splice(idx, 1);
      return true;
    }
    for (const child of kids) {
      if (removeByGuid(child, guid)) return true;
    }
  }
  return false;
}

/** 문서의 객체 키 카운터를 1 증가시키고 새 값을 반환한다. */
export function allocObjectKey(doc: OvdrjmDoc): number {
  const cur = typeof doc.MapObjectKeyIndex === "number" ? Math.floor(doc.MapObjectKeyIndex) : 0;
  doc.MapObjectKeyIndex = cur + 1;
  return cur + 1;
}

/** 32자리 대문자 hex GUID 를 만든다. rand 를 주입하면 결정적(테스트용). */
export function randomActorGuid(rand: () => number = Math.random): string {
  return Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16).toUpperCase()).join("");
}

/**
 * 새 인스턴스 노드를 만든다.
 * 필드 순서: InstanceType, ActorGuid, ObjectKey, Name, ...properties
 */
export function newInstanceNode(
  cls: string,
  name: string,
  properties: Record<string, unknown>,
  doc: OvdrjmDoc,
  actorGuid?: string,
): OvdrjmNode {
  return {
    InstanceType: cls,
    ActorGuid: actorGuid ?? randomActorGuid(),
    ObjectKey: allocObjectKey(doc),
    Name: name,
    ...properties,
  };
}
