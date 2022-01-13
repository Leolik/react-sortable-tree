import { ReactNode } from 'react'

export interface GetTreeItemChildren {
  done: (children: TreeItem[]) => void
  node: TreeItem
  path: number[]
  lowerSiblingCounts: number[]
  treeIndex: number
}

export type GetTreeItemChildrenFn = (data: GetTreeItemChildren) => void

export type GetNodeKeyFunction = (data: TreeIndex & TreeNode) => string | number

export interface TreeItem {
  title?: ReactNode | undefined
  subtitle?: ReactNode | undefined
  expanded?: boolean | undefined
  children?: TreeItem[] | GetTreeItemChildrenFn | undefined
  [key: string]: any
}

export interface TreeNode {
  node: TreeItem
}

export interface TreePath {
  path: number[]
}

export interface TreeIndex {
  treeIndex: number
}

export interface FullTree {
  treeData: TreeItem[] | undefined | null
}

export interface NodeData extends TreeNode, TreePath, TreeIndex {}

export interface SearchData extends NodeData {
  searchQuery: string
}

export type SearchParams = {
  node: TreeItem
  path: number[]
  treeIndex: number
  searchQuery: string
}

export type SearchFinishCallbackParams = {
  node: TreeItem
  path: number[]
  treeIndex: number
}[]

export type GenerateNodePropsParams = {
  node: TreeItem
  path: number[]
  treeIndex: number
  lowerSiblingCounts: number[]
  isSearchMatch: boolean
  isSearchFocus: boolean
}

export type ShouldCopyOnOutsideDropParams = {
  node: any
  prevPath: number[]
  prevTreeIndex: number
}

export type OnMoveNodeParams = {
  treeData: TreeItem[]
  node: TreeItem
  nextParentNode?: TreeItem
  prevPath: number[]
  prevTreeIndex: number
  nextPath: number[] | null
  nextTreeIndex: number | null
}

export type CanDropParams = {
  node: TreeItem
  prevPath: number[]
  prevParent: TreeItem | null
  prevTreeIndex: number
  nextPath: number[]
  nextParent: TreeItem | null
  nextTreeIndex: number
}

export type OnVisibilityToggleParams = {
  treeData: TreeItem[]
  node: TreeItem
  expanded: boolean
  path: number[]
}

export type OnDragStateChangedParams = {
  isDragging: boolean
  draggedNode: TreeItem
}

export type ReactSortableTreeProps = {
  dragDropManager?: {
    getMonitor: () => unknown
  }

  // Tree data in the following format:
  // [{title: 'main', subtitle: 'sub'}, { title: 'value2', expanded: true, children: [{ title: 'value3') }] }]
  // `title` is the primary label for the node
  // `subtitle` is a secondary label for the node
  // `expanded` shows children of the node if true, or hides them if false. Defaults to false.
  // `children` is an array of child nodes belonging to the node.
  treeData: any[]

  // Style applied to the container wrapping the tree (style defaults to {height: '100%'})
  style?: {
    [key: string]: any
  }

  // Class name for the container wrapping the tree
  className?: string

  // Style applied to the inner, scrollable container (for padding, etc.)
  innerStyle?: {
    [key: string]: any
  }

  // Size in px of the region near the edges that initiates scrolling on dragover
  slideRegionSize?: number

  // The width of the blocks containing the lines representing the structure of the tree.
  scaffoldBlockPxWidth?: number

  // Maximum depth nodes can be inserted at. Defaults to infinite.
  maxDepth?: number

  // The method used to search nodes.
  // Defaults to a function that uses the `searchQuery` string to search for nodes with
  // matching `title` or `subtitle` values.
  // NOTE: Changing `searchMethod` will not update the search, but changing the `searchQuery` will.
  searchMethod?: (params: SearchParams) => boolean

  // Used by the `searchMethod` to highlight and scroll to matched nodes.
  // Should be a string for the default `searchMethod`, but can be anything when using a custom search.
  searchQuery?: string // eslint-disable-line react/forbid-prop-types

  // Outline the <`searchFocusOffset`>th node and scroll to it.
  searchFocusOffset?: number

  // Get the nodes that match the search criteria. Used for counting total matches, etc.
  searchFinishCallback?: (params: SearchFinishCallbackParams) => void

  // Generate an object with additional props to be passed to the node renderer.
  // Use this for adding buttons via the `buttons` key,
  // or additional `style` / `className` settings.
  generateNodeProps?: (params: GenerateNodePropsParams) => any

  treeNodeRenderer?: any

  // Override the default component for rendering nodes (but keep the scaffolding generator)
  // This is an advanced option for complete customization of the appearance.
  // It is best to copy the component in `node-renderer-default.js` to use as a base, and customize as needed.
  nodeContentRenderer?: any

  // Override the default component for rendering an empty tree
  // This is an advanced option for complete customization of the appearance.
  // It is best to copy the component in `placeholder-renderer-default.js` to use as a base,
  // and customize as needed.
  placeholderRenderer?: any

  theme?: {
    style: any
    innerStyle: any
    scaffoldBlockPxWidth: number
    slideRegionSize: number
    treeNodeRenderer: any
    nodeContentRenderer: any
    placeholderRenderer: any
  }

  // Determine the unique key used to identify each node and
  // generate the `path` array passed in callbacks.
  // By default, returns the index in the tree (omitting hidden nodes).
  getNodeKey?: GetNodeKeyFunction

  // Called whenever tree data changed.
  // Just like with React input elements, you have to update your
  // own component's data to see the changes reflected.
  onChange: (treeData: TreeItem[]) => void

  // Called after node move operation.
  onMoveNode?: (params: OnMoveNodeParams) => void

  // Determine whether a node can be dragged. Set to false to disable dragging on all nodes.
  canDrag?: (params: GenerateNodePropsParams) => boolean

  // Determine whether a node can be dropped based on its path and parents'.
  canDrop?: (params: CanDropParams) => boolean

  // Determine whether a node can have children
  canNodeHaveChildren?: (node: TreeItem) => boolean

  // When true, or a callback returning true, dropping nodes to react-dnd
  // drop targets outside of this tree will not remove them from this tree
  shouldCopyOnOutsideDrop?: (
    params: ShouldCopyOnOutsideDropParams
  ) => boolean | boolean

  // Called after children nodes collapsed or expanded.
  onVisibilityToggle?: (params: OnVisibilityToggleParams) => void

  dndType?: string

  // Called to track between dropped and dragging
  onDragStateChanged?: (params: OnDragStateChangedParams) => void

  // Specify that nodes that do not match search will be collapsed
  onlyExpandSearchedNodes?: boolean

  // rtl support
  rowDirection?: 'rtl' | 'ltr'

  debugMode?: boolean
}

export const defaultGetNodeKey = ({ treeIndex }: TreeIndex) => treeIndex

// Cheap hack to get the text of a react object
const getReactElementText = (parent: any) => {
  if (typeof parent === 'string') {
    return parent
  }

  if (
    parent === null ||
    typeof parent !== 'object' ||
    !parent.props ||
    !parent.props.children ||
    (typeof parent.props.children !== 'string' &&
      typeof parent.props.children !== 'object')
  ) {
    return ''
  }

  if (typeof parent.props.children === 'string') {
    return parent.props.children
  }

  return parent.props.children
    .map((child: any) => getReactElementText(child))
    .join('')
}

// Search for a query string inside a node property
const stringSearch = (
  key: string,
  searchQuery: string,
  node: TreeItem,
  path: number[],
  treeIndex: number
) => {
  if (typeof node[key] === 'function') {
    // Search within text after calling its function to generate the text
    return (
      String(node[key]({ node, path, treeIndex })).indexOf(searchQuery) > -1
    )
  }
  if (typeof node[key] === 'object') {
    // Search within text inside react elements
    return getReactElementText(node[key]).indexOf(searchQuery) > -1
  }

  // Search within string
  return node[key] && String(node[key]).indexOf(searchQuery) > -1
}

export const defaultSearchMethod = ({
  node,
  path,
  treeIndex,
  searchQuery,
}: SearchData): boolean => {
  return (
    stringSearch('title', searchQuery, node, path, treeIndex) ||
    stringSearch('subtitle', searchQuery, node, path, treeIndex)
  )
}
