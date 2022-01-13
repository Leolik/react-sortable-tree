// @ts-nocheck

import React, { Component } from 'react'
import withScrolling, {
  createHorizontalStrength,
  createScrollingComponent,
  createVerticalStrength,
} from '@nosferatu500/react-dnd-scrollzone'
import isEqual from 'lodash.isequal'
import { DndContext, DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Virtuoso } from 'react-virtuoso'
import NodeRendererDefault from './node-renderer-default'
import PlaceholderRendererDefault from './placeholder-renderer-default'
import './react-sortable-tree.css'
// eslint-disable-next-line import/no-named-as-default
import TreeNode from './tree-node'
import TreePlaceholder from './tree-placeholder'
import { classnames } from './utils/classnames'
import {
  ReactSortableTreeProps,
  defaultGetNodeKey,
  defaultSearchMethod,
} from './utils/default-handlers'
import { wrapPlaceholder, wrapSource, wrapTarget } from './utils/dnd-manager'
import { slideRows } from './utils/generic-utils'
import {
  memoizedGetDescendantCount,
  memoizedGetFlatDataFromTree,
  memoizedInsertNode,
} from './utils/memoized-tree-data-utils'
import {
  changeNodeAtPath,
  find,
  insertNode,
  removeNode,
  toggleExpandedForAll,
  walk,
} from './utils/tree-data-utils'

let treeIdCounter = 1

const mergeTheme = (props) => {
  const merged = {
    ...props,
    style: { ...props.theme.style, ...props.style },
    innerStyle: { ...props.theme.innerStyle, ...props.innerStyle },
  }

  const overridableDefaults = {
    nodeContentRenderer: NodeRendererDefault,
    placeholderRenderer: PlaceholderRendererDefault,
    scaffoldBlockPxWidth: 44,
    slideRegionSize: 100,
    treeNodeRenderer: TreeNode,
  }
  Object.keys(overridableDefaults).forEach((propKey) => {
    // If prop has been specified, do not change it
    // If prop is specified in theme, use the theme setting
    // If all else fails, fall back to the default
    if (props[propKey] === null) {
      merged[propKey] =
        typeof props.theme[propKey] !== 'undefined'
          ? props.theme[propKey]
          : overridableDefaults[propKey]
    }
  })

  return merged
}

class ReactSortableTree extends Component {
  constructor(props) {
    super(props)

    this.listRef = React.createRef()

    const { dndType, nodeContentRenderer, treeNodeRenderer, slideRegionSize } =
      mergeTheme(props)

    // Wrapping classes for use with react-dnd
    this.treeId = `rst__${treeIdCounter}`
    treeIdCounter += 1
    this.dndType = dndType || this.treeId
    this.nodeContentRenderer = wrapSource(
      nodeContentRenderer,
      this.startDrag,
      this.endDrag,
      this.dndType
    )
    this.treePlaceholderRenderer = wrapPlaceholder(
      TreePlaceholder,
      this.treeId,
      this.drop,
      this.dndType
    )

    // Prepare scroll-on-drag options for this list
    this.scrollZoneVirtualList = (createScrollingComponent || withScrolling)(
      React.forwardRef((props, ref) => {
        const { dragDropManager, ...otherProps } = props
        return <Virtuoso ref={this.listRef} {...otherProps} />
      })
    )
    this.vStrength = createVerticalStrength(slideRegionSize)
    this.hStrength = createHorizontalStrength(slideRegionSize)

    this.state = {
      draggingTreeData: null,
      draggedNode: null,
      draggedMinimumTreeIndex: null,
      draggedDepth: null,
      searchMatches: [],
      searchFocusTreeIndex: null,
      dragging: false,

      // props that need to be used in gDSFP or static functions will be stored here
      instanceProps: {
        treeData: [],
        ignoreOneTreeUpdate: false,
        searchQuery: null,
        searchFocusOffset: null,
      },
    }

    this.treeNodeRenderer = wrapTarget(
      treeNodeRenderer,
      this.canNodeHaveChildren,
      this.treeId,
      this.props.maxDepth,
      this.props.canDrop,
      this.drop,
      this.dragHover,
      this.dndType,
      this.state.draggingTreeData,
      this.props.treeData,
      this.props.getNodeKey
    )

    this.toggleChildrenVisibility = this.toggleChildrenVisibility.bind(this)
    this.moveNode = this.moveNode.bind(this)
    this.startDrag = this.startDrag.bind(this)
    this.dragHover = this.dragHover.bind(this)
    this.endDrag = this.endDrag.bind(this)
    this.drop = this.drop.bind(this)
    this.handleDndMonitorChange = this.handleDndMonitorChange.bind(this)
  }

  componentDidMount() {
    ReactSortableTree.loadLazyChildren(this.props, this.state)
    const stateUpdate = ReactSortableTree.search(
      this.props,
      this.state,
      true,
      true,
      false
    )
    this.setState(stateUpdate)

    // Hook into react-dnd state changes to detect when the drag ends
    // TODO: This is very brittle, so it needs to be replaced if react-dnd
    // offers a more official way to detect when a drag ends
    this.clearMonitorSubscription = this.props.dragDropManager
      .getMonitor()
      .subscribeToStateChange(this.handleDndMonitorChange)
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    const { instanceProps } = prevState
    const newState = {}

    const isTreeDataEqual = isEqual(instanceProps.treeData, nextProps.treeData)

    // make sure we have the most recent version of treeData
    instanceProps.treeData = nextProps.treeData

    if (!isTreeDataEqual) {
      if (instanceProps.ignoreOneTreeUpdate) {
        instanceProps.ignoreOneTreeUpdate = false
      } else {
        newState.searchFocusTreeIndex = null
        ReactSortableTree.loadLazyChildren(nextProps, prevState)
        Object.assign(
          newState,
          ReactSortableTree.search(nextProps, prevState, false, false, false)
        )
      }

      newState.draggingTreeData = null
      newState.draggedNode = null
      newState.draggedMinimumTreeIndex = null
      newState.draggedDepth = null
      newState.dragging = false
    } else if (!isEqual(instanceProps.searchQuery, nextProps.searchQuery)) {
      Object.assign(
        newState,
        ReactSortableTree.search(nextProps, prevState, true, true, false)
      )
    } else if (
      instanceProps.searchFocusOffset !== nextProps.searchFocusOffset
    ) {
      Object.assign(
        newState,
        ReactSortableTree.search(nextProps, prevState, true, true, true)
      )
    }

    instanceProps.searchQuery = nextProps.searchQuery
    instanceProps.searchFocusOffset = nextProps.searchFocusOffset
    newState.instanceProps = { ...instanceProps, ...newState.instanceProps }

    return newState
  }

  // listen to dragging
  componentDidUpdate(prevProps, prevState) {
    // if it is not the same then call the onDragStateChanged
    if (this.state.dragging !== prevState.dragging) {
      if (this.props.onDragStateChanged) {
        this.props.onDragStateChanged({
          isDragging: this.state.dragging,
          draggedNode: this.state.draggedNode,
        })
      }
    }
  }

  componentWillUnmount() {
    this.clearMonitorSubscription()
  }

  getRows(treeData) {
    return memoizedGetFlatDataFromTree({
      ignoreCollapsed: true,
      getNodeKey: this.props.getNodeKey,
      treeData,
    })
  }

  handleDndMonitorChange() {
    const monitor = this.props.dragDropManager.getMonitor()
    // If the drag ends and the tree is still in a mid-drag state,
    // it means that the drag was canceled or the dragSource dropped
    // elsewhere, and we should reset the state of this tree
    if (!monitor.isDragging() && this.state.draggingTreeData) {
      setTimeout(() => {
        this.endDrag()
      })
    }
  }

  toggleChildrenVisibility({ node: targetNode, path }) {
    const { instanceProps } = this.state

    const treeData = changeNodeAtPath({
      treeData: instanceProps.treeData,
      path,
      newNode: ({ node }) => ({ ...node, expanded: !node.expanded }),
      getNodeKey: this.props.getNodeKey,
    })

    this.props.onChange(treeData)

    this.props.onVisibilityToggle({
      treeData,
      node: targetNode,
      expanded: !targetNode.expanded,
      path,
    })
  }

  moveNode({
    node,
    path: prevPath,
    treeIndex: prevTreeIndex,
    depth,
    minimumTreeIndex,
  }) {
    const {
      treeData,
      treeIndex,
      path,
      parentNode: nextParentNode,
    } = insertNode({
      treeData: this.state.draggingTreeData,
      newNode: node,
      depth,
      minimumTreeIndex,
      expandParent: true,
      getNodeKey: this.props.getNodeKey,
    })

    this.props.onChange(treeData)

    this.props.onMoveNode({
      treeData,
      node,
      treeIndex,
      path,
      nextPath: path,
      nextTreeIndex: treeIndex,
      prevPath,
      prevTreeIndex,
      nextParentNode,
    })
  }

  // returns the new state after search
  static search(props, state, seekIndex, expand, singleSearch) {
    const {
      onChange,
      getNodeKey,
      searchFinishCallback,
      searchQuery,
      searchMethod,
      searchFocusOffset,
      onlyExpandSearchedNodes,
    } = props

    const { instanceProps } = state

    // Skip search if no conditions are specified
    if (!searchQuery && !searchMethod) {
      if (searchFinishCallback) {
        searchFinishCallback([])
      }

      return { searchMatches: [] }
    }

    const newState = { instanceProps: {} }

    // if onlyExpandSearchedNodes collapse the tree and search
    const { treeData: expandedTreeData, matches: searchMatches } = find({
      getNodeKey,
      treeData: onlyExpandSearchedNodes
        ? toggleExpandedForAll({
            treeData: instanceProps.treeData,
            expanded: false,
          })
        : instanceProps.treeData,
      searchQuery,
      searchMethod: searchMethod || defaultSearchMethod,
      searchFocusOffset,
      expandAllMatchPaths: expand && !singleSearch,
      expandFocusMatchPaths: !!expand,
    })

    // Update the tree with data leaving all paths leading to matching nodes open
    if (expand) {
      newState.instanceProps.ignoreOneTreeUpdate = true // Prevents infinite loop
      onChange(expandedTreeData)
    }

    if (searchFinishCallback) {
      searchFinishCallback(searchMatches)
    }

    let searchFocusTreeIndex = null
    if (
      seekIndex &&
      searchFocusOffset !== null &&
      searchFocusOffset < searchMatches.length
    ) {
      searchFocusTreeIndex = searchMatches[searchFocusOffset].treeIndex
    }

    newState.searchMatches = searchMatches
    newState.searchFocusTreeIndex = searchFocusTreeIndex

    return newState
  }

  startDrag = ({ path }) => {
    this.setState((prevState) => {
      const {
        treeData: draggingTreeData,
        node: draggedNode,
        treeIndex: draggedMinimumTreeIndex,
      } = removeNode({
        treeData: prevState.instanceProps.treeData,
        path,
        getNodeKey: this.props.getNodeKey,
      })

      return {
        draggingTreeData,
        draggedNode,
        draggedDepth: path.length - 1,
        draggedMinimumTreeIndex,
        dragging: true,
      }
    })
  }

  dragHover = ({
    node: draggedNode,
    depth: draggedDepth,
    minimumTreeIndex: draggedMinimumTreeIndex,
  }) => {
    // Ignore this hover if it is at the same position as the last hover
    if (
      this.state.draggedDepth === draggedDepth &&
      this.state.draggedMinimumTreeIndex === draggedMinimumTreeIndex
    ) {
      return
    }

    this.setState(({ draggingTreeData, instanceProps }) => {
      // Fall back to the tree data if something is being dragged in from
      //  an external element
      const newDraggingTreeData = draggingTreeData || instanceProps.treeData

      const addedResult = memoizedInsertNode({
        treeData: newDraggingTreeData,
        newNode: draggedNode,
        depth: draggedDepth,
        minimumTreeIndex: draggedMinimumTreeIndex,
        expandParent: true,
        getNodeKey: this.props.getNodeKey,
      })

      const rows = this.getRows(addedResult.treeData)
      const expandedParentPath = rows[addedResult.treeIndex].path

      return {
        draggedNode,
        draggedDepth,
        draggedMinimumTreeIndex,
        draggingTreeData: changeNodeAtPath({
          treeData: newDraggingTreeData,
          path: expandedParentPath.slice(0, -1),
          newNode: ({ node }) => ({ ...node, expanded: true }),
          getNodeKey: this.props.getNodeKey,
        }),
        // reset the scroll focus so it doesn't jump back
        // to a search result while dragging
        searchFocusTreeIndex: null,
        dragging: true,
      }
    })
  }

  endDrag = (dropResult) => {
    const { instanceProps } = this.state

    const resetTree = () =>
      this.setState({
        draggingTreeData: null,
        draggedNode: null,
        draggedMinimumTreeIndex: null,
        draggedDepth: null,
        dragging: false,
      })

    // Drop was cancelled
    if (!dropResult) {
      resetTree()
    } else if (dropResult.treeId !== this.treeId) {
      // The node was dropped in an external drop target or tree
      const { node, path, treeIndex } = dropResult
      let shouldCopy = this.props.shouldCopyOnOutsideDrop
      if (typeof shouldCopy === 'function') {
        shouldCopy = shouldCopy({
          node,
          prevTreeIndex: treeIndex,
          prevPath: path,
        })
      }

      let treeData = this.state.draggingTreeData || instanceProps.treeData

      // If copying is enabled, a drop outside leaves behind a copy in the
      //  source tree
      if (shouldCopy) {
        treeData = changeNodeAtPath({
          treeData: instanceProps.treeData, // use treeData unaltered by the drag operation
          path,
          newNode: ({ node: copyNode }) => ({ ...copyNode }), // create a shallow copy of the node
          getNodeKey: this.props.getNodeKey,
        })
      }

      this.props.onChange(treeData)

      this.props.onMoveNode({
        treeData,
        node,
        treeIndex: null,
        path: null,
        nextPath: null,
        nextTreeIndex: null,
        prevPath: path,
        prevTreeIndex: treeIndex,
      })
    }
  }

  drop = (dropResult) => {
    this.moveNode(dropResult)
  }

  canNodeHaveChildren = (node) => {
    const { canNodeHaveChildren } = this.props
    if (canNodeHaveChildren) {
      return canNodeHaveChildren(node)
    }
    return true
  }

  // Load any children in the tree that are given by a function
  // calls the onChange callback on the new treeData
  static loadLazyChildren(props, state) {
    const { instanceProps } = state

    walk({
      treeData: instanceProps.treeData,
      getNodeKey: props.getNodeKey,
      callback: ({ node, path, lowerSiblingCounts, treeIndex }) => {
        // If the node has children defined by a function, and is either expanded
        //  or set to load even before expansion, run the function.
        if (
          node.children &&
          typeof node.children === 'function' &&
          (node.expanded || props.loadCollapsedLazyChildren)
        ) {
          // Call the children fetching function
          node.children({
            node,
            path,
            lowerSiblingCounts,
            treeIndex,

            // Provide a helper to append the new data when it is received
            done: (childrenArray) =>
              props.onChange(
                changeNodeAtPath({
                  treeData: instanceProps.treeData,
                  path,
                  newNode: ({ node: oldNode }) =>
                    // Only replace the old node if it's the one we set off to find children
                    //  for in the first place
                    oldNode === node
                      ? {
                          ...oldNode,
                          children: childrenArray,
                        }
                      : oldNode,
                  getNodeKey: props.getNodeKey,
                })
              ),
          })
        }
      },
    })
  }

  renderRow(
    row,
    { listIndex, style, getPrevRow, matchKeys, swapFrom, swapDepth, swapLength }
  ) {
    const { node, parentNode, path, lowerSiblingCounts, treeIndex } = row

    const {
      canDrag,
      generateNodeProps,
      scaffoldBlockPxWidth,
      searchFocusOffset,
      rowDirection,
    } = mergeTheme(this.props)
    const TreeNodeRenderer = this.treeNodeRenderer
    const NodeContentRenderer = this.nodeContentRenderer
    const nodeKey = path[path.length - 1]
    const isSearchMatch = nodeKey in matchKeys
    const isSearchFocus =
      isSearchMatch && matchKeys[nodeKey] === searchFocusOffset
    const callbackParams = {
      node,
      parentNode,
      path,
      lowerSiblingCounts,
      treeIndex,
      isSearchMatch,
      isSearchFocus,
    }
    const nodeProps = !generateNodeProps
      ? {}
      : generateNodeProps(callbackParams)
    const rowCanDrag =
      typeof canDrag !== 'function' ? canDrag : canDrag(callbackParams)

    const sharedProps = {
      treeIndex,
      scaffoldBlockPxWidth,
      node,
      path,
      treeId: this.treeId,
      rowDirection,
    }

    return (
      <TreeNodeRenderer
        style={style}
        key={nodeKey}
        listIndex={listIndex}
        getPrevRow={getPrevRow}
        lowerSiblingCounts={lowerSiblingCounts}
        swapFrom={swapFrom}
        swapLength={swapLength}
        swapDepth={swapDepth}
        {...sharedProps}>
        <NodeContentRenderer
          parentNode={parentNode}
          isSearchMatch={isSearchMatch}
          isSearchFocus={isSearchFocus}
          canDrag={rowCanDrag}
          toggleChildrenVisibility={this.toggleChildrenVisibility}
          {...sharedProps}
          {...nodeProps}
        />
      </TreeNodeRenderer>
    )
  }

  render() {
    const {
      dragDropManager,
      style,
      className,
      innerStyle,
      placeholderRenderer,
      getNodeKey,
      rowDirection,
    } = mergeTheme(this.props)
    const {
      searchMatches,
      searchFocusTreeIndex,
      draggedNode,
      draggedDepth,
      draggedMinimumTreeIndex,
      instanceProps,
    } = this.state

    const treeData = this.state.draggingTreeData || instanceProps.treeData
    const rowDirectionClass = rowDirection === 'rtl' ? 'rst__rtl' : null

    let rows
    let swapFrom = null
    let swapLength = null
    if (draggedNode && draggedMinimumTreeIndex !== null) {
      const addedResult = memoizedInsertNode({
        treeData,
        newNode: draggedNode,
        depth: draggedDepth,
        minimumTreeIndex: draggedMinimumTreeIndex,
        expandParent: true,
        getNodeKey,
      })

      const swapTo = draggedMinimumTreeIndex
      swapFrom = addedResult.treeIndex
      swapLength = 1 + memoizedGetDescendantCount({ node: draggedNode })
      rows = slideRows(
        this.getRows(addedResult.treeData),
        swapFrom,
        swapTo,
        swapLength
      )
    } else {
      rows = this.getRows(treeData)
    }

    // Get indices for rows that match the search conditions
    const matchKeys = {}
    searchMatches.forEach(({ path }, i) => {
      matchKeys[path[path.length - 1]] = i
    })

    // Seek to the focused search result if there is one specified
    if (searchFocusTreeIndex !== null) {
      this.listRef.current.scrollToIndex({
        index: searchFocusTreeIndex,
        align: 'center',
      })
    }

    let containerStyle = style
    let list
    if (rows.length < 1) {
      const Placeholder = this.treePlaceholderRenderer
      const PlaceholderContent = placeholderRenderer
      list = (
        <Placeholder treeId={this.treeId} drop={this.drop}>
          <PlaceholderContent />
        </Placeholder>
      )
    } else {
      containerStyle = { height: '100%', ...containerStyle }

      const ScrollZoneVirtualList = this.scrollZoneVirtualList
      // Render list with react-virtuoso
      list = (
        <ScrollZoneVirtualList
          data={rows}
          dragDropManager={dragDropManager}
          verticalStrength={this.vStrength}
          horizontalStrength={this.hStrength}
          className="rst__virtualScrollOverride"
          style={innerStyle}
          itemContent={(index) =>
            this.renderRow(rows[index], {
              listIndex: index,
              getPrevRow: () => rows[index - 1] || null,
              matchKeys,
              swapFrom,
              swapDepth: draggedDepth,
              swapLength,
            })
          }
        />
      )
    }

    return (
      <div
        className={classnames('rst__tree', className, rowDirectionClass)}
        style={containerStyle}>
        {list}
      </div>
    )
  }
}

ReactSortableTree.defaultProps = {
  canDrag: true,
  canDrop: null,
  canNodeHaveChildren: () => true,
  className: '',
  dndType: null,
  generateNodeProps: null,
  getNodeKey: defaultGetNodeKey,
  innerStyle: {},
  maxDepth: null,
  treeNodeRenderer: null,
  nodeContentRenderer: null,
  onMoveNode: () => {},
  onVisibilityToggle: () => {},
  placeholderRenderer: null,
  scaffoldBlockPxWidth: null,
  searchFinishCallback: null,
  searchFocusOffset: null,
  searchMethod: null,
  searchQuery: null,
  shouldCopyOnOutsideDrop: false,
  slideRegionSize: null,
  style: {},
  theme: {},
  onDragStateChanged: () => {},
  onlyExpandSearchedNodes: false,
  rowDirection: 'ltr',
  debugMode: false,
}

const SortableTreeWithoutDndContext = (props: ReactSortableTreeProps) => (
  <DndContext.Consumer>
    {({ dragDropManager }) =>
      dragDropManager === undefined ? null : (
        <ReactSortableTree {...props} dragDropManager={dragDropManager} />
      )
    }
  </DndContext.Consumer>
)

const SortableTree = (props: ReactSortableTreeProps) => (
  <DndProvider debugMode={props.debugMode} backend={HTML5Backend}>
    <SortableTreeWithoutDndContext {...props} />
  </DndProvider>
)

// Export the tree component without the react-dnd DragDropContext,
// for when component is used with other components using react-dnd.
// see: https://github.com/gaearon/react-dnd/issues/186
export { SortableTreeWithoutDndContext }

export default SortableTree
