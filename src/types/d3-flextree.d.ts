/** d3-flextree 的极简类型声明。
 *
 * 官方包不带 .d.ts，这里只声明我们用到的那部分，避免全库 any。
 */
declare module "d3-flextree" {
  export interface FlexHierarchyNode<T> {
    data: T;
    depth: number;
    /** 横向中心（单位坐标）。 */
    x: number;
    /** 层深（单位坐标）。 */
    y: number;
    parent: FlexHierarchyNode<T> | null;
    children?: FlexHierarchyNode<T>[];
    each(cb: (node: FlexHierarchyNode<T>) => void): void;
  }

  export interface FlexTreeLayout<T> {
    (root: FlexHierarchyNode<T>): FlexHierarchyNode<T>;
    hierarchy(data: T): FlexHierarchyNode<T>;
  }

  export interface FlexTreeOptions<T> {
    nodeSize?: (node: FlexHierarchyNode<T>) => [number, number] | number;
    spacing?: number | ((a: FlexHierarchyNode<T>, b: FlexHierarchyNode<T>) => number);
  }

  export function flextree<T = unknown>(options?: FlexTreeOptions<T>): FlexTreeLayout<T>;
}
