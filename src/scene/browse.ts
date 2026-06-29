import { type BrowseNode, findByGuid } from "./guid.js";

/**
 * level.browse 결과 후처리 — startGuid/classType/maxDepth 필터.
 * Studio 서버는 이 인자들을 무시하므로 클라이언트 측에서 필터링한다.
 */

export interface BrowseArgs {
  startGuid?: string;
  classType?: string;
  maxDepth?: number;
}

/** classType 에 해당하는 노드 + 그 조상만 남긴다. */
export function filterByClass(nodes: BrowseNode[], classType: string): BrowseNode[] {
  const result: BrowseNode[] = [];
  for (const node of nodes) {
    const children = node.children ? filterByClass(node.children, classType) : [];
    if (node.class === classType || children.length > 0) {
      result.push({ ...node, children });
    }
  }
  return result;
}

/** maxDepth 이후의 children 을 제거한다. */
export function truncateDepth(nodes: BrowseNode[], maxDepth: number, depth = 1): BrowseNode[] {
  return nodes.map((node) => {
    if (depth >= maxDepth || !node.children) {
      const { children: _children, ...rest } = node;
      return rest;
    }
    return { ...node, children: truncateDepth(node.children, maxDepth, depth + 1) };
  });
}

/** level.browse 의 raw result(배열 또는 {level:[...]})를 인자에 맞게 후처리한다. */
export function postProcess(result: unknown, args: BrowseArgs): BrowseNode[] {
  let nodes: BrowseNode[];
  if (Array.isArray(result)) {
    nodes = result as BrowseNode[];
  } else if (
    result && typeof result === "object" && "level" in result &&
    Array.isArray((result as { level: unknown }).level)
  ) {
    nodes = (result as { level: BrowseNode[] }).level;
  } else {
    return [];
  }

  if (args.startGuid) {
    const start = findByGuid(nodes, args.startGuid);
    if (!start) return [];
    nodes = [start];
  }
  if (args.classType) {
    nodes = filterByClass(nodes, args.classType);
  }
  if (typeof args.maxDepth === "number" && args.maxDepth > 0) {
    nodes = truncateDepth(nodes, args.maxDepth);
  }
  return nodes;
}
