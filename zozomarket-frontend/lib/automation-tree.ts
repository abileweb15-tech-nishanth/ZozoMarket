import type { FlowEdge, FlowNode } from '@/lib/api'

/**
 * The vertical builder edits the same nodes + edges the API stores.
 * Every step has one way out, except a Condition, which has a `true` and a `false` way out.
 * Branches never merge, so the graph is always a tree rooted at the trigger.
 */

export type Graph = { nodes: FlowNode[]; edges: FlowEdge[] }
export type Handle = 'true' | 'false' | null

export type TreeNode = {
  node: FlowNode
  next: TreeNode | null
  yes: TreeNode | null
  no: TreeNode | null
}

export const STEP_KINDS = ['Email', 'Delay', 'Condition', 'Add tag', 'Remove tag', 'Goal', 'End'] as const
export type StepKind = (typeof STEP_KINDS)[number]

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)

export function defaultStep(kind: StepKind | 'Trigger'): FlowNode {
  const config: Record<string, unknown> =
    kind === 'Delay' ? { amount: 1, unit: 'days' }
      : kind === 'Condition' ? { type: 'opened_previous' }
        : kind === 'Email' ? { subject: '' }
          : {}
  const label =
    kind === 'Delay' ? 'Wait'
      : kind === 'Condition' ? 'Check'
        : kind === 'End' ? 'End'
          : kind === 'Goal' ? 'Goal reached'
            : kind
  return { id: newId(), kind, label, config, position: { x: 0, y: 0 } }
}

const handleOf = (edge: FlowEdge): Handle =>
  edge.sourceHandle === 'true' || edge.sourceHandle === 'false' ? edge.sourceHandle : null

function outEdge(graph: Graph, source: string, handle: Handle) {
  return graph.edges.find((edge) => edge.source === source && handleOf(edge) === handle)
}

function link(source: string, target: string, handle: Handle): FlowEdge {
  return { id: newId(), source, target, sourceHandle: handle }
}

export function triggerOf(graph: Graph) {
  return graph.nodes.find((node) => node.kind === 'Trigger') ?? null
}

/** Old drafts may have no edges at all; treat their list order as a straight line. */
export function withEdges(graph: Graph): Graph {
  if (graph.edges.length || graph.nodes.length < 2) return graph
  const ordered = [...graph.nodes].sort((a, b) => (a.kind === 'Trigger' ? -1 : b.kind === 'Trigger' ? 1 : 0))
  const edges = ordered.slice(1).map((node, index) => link(ordered[index].id, node.id, null))
  return { nodes: graph.nodes, edges }
}

export function ensureTrigger(graph: Graph, label: string): Graph {
  if (triggerOf(graph)) return graph
  const trigger = { ...defaultStep('Trigger'), label }
  return { nodes: [trigger, ...graph.nodes], edges: graph.edges }
}

export function buildTree(graph: Graph): { root: TreeNode | null; unreachable: FlowNode[] } {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()

  const walk = (id: string | undefined): TreeNode | null => {
    if (!id || seen.has(id)) return null
    const node = byId.get(id)
    if (!node) return null
    seen.add(id)
    if (node.kind === 'Condition') {
      return {
        node,
        next: null,
        yes: walk(outEdge(graph, id, 'true')?.target),
        no: walk(outEdge(graph, id, 'false')?.target),
      }
    }
    if (node.kind === 'End') return { node, next: null, yes: null, no: null }
    const out = outEdge(graph, id, null) ?? graph.edges.find((edge) => edge.source === id)
    return { node, next: walk(out?.target), yes: null, no: null }
  }

  const trigger = triggerOf(graph)
  const root = trigger ? walk(trigger.id) : null
  return { root, unreachable: graph.nodes.filter((node) => !seen.has(node.id)) }
}

/** Drop every edge that touches `id`, so the node can be placed somewhere else. */
function detach(graph: Graph, id: string): Graph {
  return { nodes: graph.nodes, edges: graph.edges.filter((edge) => edge.source !== id && edge.target !== id) }
}

/**
 * Put `node` on the path that leaves `parentId` through `handle`.
 * Whatever followed that path continues after the new step. A new Condition keeps
 * the rest of the path on Yes and gets an End on No.
 */
export function placeAfter(graph: Graph, parentId: string, handle: Handle, node: FlowNode): Graph {
  const existing = graph.nodes.some((item) => item.id === node.id)
  const next = existing ? detach(graph, node.id) : { nodes: [...graph.nodes, node], edges: graph.edges }
  const old = outEdge(next, parentId, handle)
  const child = old?.target ?? null
  if (child && node.kind === 'End') return graph
  const edges = next.edges.filter((edge) => edge !== old)
  edges.push(link(parentId, node.id, handle))
  const nodes = [...next.nodes]

  if (node.kind === 'Condition') {
    const yesEnd = child ? null : defaultStep('End')
    const noEnd = defaultStep('End')
    if (yesEnd) nodes.push(yesEnd)
    nodes.push(noEnd)
    edges.push(link(node.id, child ?? yesEnd!.id, 'true'))
    edges.push(link(node.id, noEnd.id, 'false'))
  } else if (child) {
    edges.push(link(node.id, child, null))
  }
  return { nodes, edges }
}

function subtreeIds(graph: Graph, id: string, into = new Set<string>()) {
  if (into.has(id)) return into
  into.add(id)
  graph.edges.filter((edge) => edge.source === id).forEach((edge) => subtreeIds(graph, edge.target, into))
  return into
}

function removeSubtree(graph: Graph, id: string): Graph {
  const gone = subtreeIds(graph, id)
  return {
    nodes: graph.nodes.filter((node) => !gone.has(node.id)),
    edges: graph.edges.filter((edge) => !gone.has(edge.source) && !gone.has(edge.target)),
  }
}

/** A normal step is lifted out and its parent continues to its child. A Condition takes both branches with it. */
export function removeStep(graph: Graph, id: string): Graph {
  const node = graph.nodes.find((item) => item.id === id)
  if (!node || node.kind === 'Trigger') return graph
  if (node.kind === 'Condition') return removeSubtree(graph, id)
  const incoming = graph.edges.find((edge) => edge.target === id)
  const outgoing = graph.edges.find((edge) => edge.source === id)
  const edges = graph.edges.filter((edge) => edge !== incoming && edge !== outgoing)
  if (incoming && outgoing) edges.push(link(incoming.source, outgoing.target, handleOf(incoming)))
  return { nodes: graph.nodes.filter((item) => item.id !== id), edges }
}

export function deleteUnreachable(graph: Graph, id: string): Graph {
  const rest = detach(graph, id)
  return { nodes: rest.nodes.filter((node) => node.id !== id), edges: rest.edges }
}

export function hasChild(graph: Graph, parentId: string, handle: Handle) {
  return !!outEdge(graph, parentId, handle)
}

export function countBranch(graph: Graph, id: string) {
  return subtreeIds(graph, id).size
}

const ROW = 170
const COL = 300

/** Store positions that match the vertical layout, so the saved graph reads the same anywhere. */
export function layout(graph: Graph): Graph {
  const { root, unreachable } = buildTree(graph)
  const positions = new Map<string, { x: number; y: number }>()

  const width = (tree: TreeNode | null): number => {
    if (!tree) return 1
    if (tree.node.kind === 'Condition') return Math.max(1, width(tree.yes)) + Math.max(1, width(tree.no))
    return Math.max(1, tree.next ? width(tree.next) : 1)
  }

  const place = (tree: TreeNode | null, left: number, depth: number) => {
    if (!tree) return
    const span = width(tree)
    positions.set(tree.node.id, { x: (left + span / 2) * COL, y: depth * ROW })
    if (tree.node.kind === 'Condition') {
      const yesSpan = Math.max(1, width(tree.yes))
      place(tree.yes, left, depth + 1)
      place(tree.no, left + yesSpan, depth + 1)
    } else {
      place(tree.next, left, depth + 1)
    }
  }

  place(root, 0, 0)
  unreachable.forEach((node, index) => positions.set(node.id, { x: -COL, y: index * ROW }))
  return {
    nodes: graph.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
    edges: graph.edges,
  }
}
