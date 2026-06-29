/** level.browse 가 돌려주는 트리 노드. */
export interface BrowseNode {
  guid: string;
  name: string;
  class: string;
  children?: BrowseNode[];
  filename?: string;
}

/** guid 로 노드를 재귀 탐색한다. */
export function findByGuid(nodes: BrowseNode[], guid: string): BrowseNode | undefined {
  for (const node of nodes) {
    if (node.guid === guid) return node;
    if (node.children) {
      const found = findByGuid(node.children, guid);
      if (found) return found;
    }
  }
  return undefined;
}

/** name 으로 첫 노드 탐색 (재귀). 편의 헬퍼. */
export function findByName(nodes: BrowseNode[], name: string): BrowseNode | undefined {
  for (const node of nodes) {
    if (node.name === name) return node;
    if (node.children) {
      const found = findByName(node.children, name);
      if (found) return found;
    }
  }
  return undefined;
}
