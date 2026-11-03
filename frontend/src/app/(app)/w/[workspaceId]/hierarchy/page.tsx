"use client";

import {
  CSSProperties,
  FormEvent,
  MouseEvent,
  PointerEvent,
  WheelEvent,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Copy,
  FilePlus2,
  FileText,
  FileUp,
  Plus,
  RotateCcw,
  Shapes,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ConfirmDestructiveModal } from "@/components/confirm-destructive-modal";
import type { Entity, EntityType } from "@/lib/types";
import { readCachedQuery, writeCachedQuery } from "@/lib/query-persist";
import { useAuth } from "@/providers/auth-provider";
import { Modal } from "@/components/modal";
import { Select } from "@/components/select";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { WorkspaceAccessGate, useWorkspaceAccess } from "@/components/workspace-access";
import { EntityDocumentsPanel } from "@/components/entity-documents/EntityDocumentsPanel";
import "./hierarchy-page.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
});

function flattenEntities(items: Entity[]) {
  const out: Entity[] = [];
  const walk = (nodes: Entity[]) => {
    for (const node of nodes) {
      out.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(items);
  return out;
}

function shortEntityId(value?: string | null) {
  if (!value) return "ent_unknown";
  if (value.length <= 16) return value;
  return `ent_${value.slice(0, 8)}`;
}

function inferDocCount(entity?: Entity | null) {
  if (!entity?.metadata) return 0;
  const metadata = entity.metadata as Record<string, unknown>;
  const candidates = [
    metadata.documents,
    metadata.document_count,
    metadata.doc_count,
    metadata.chunk_count,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(0, Math.floor(candidate));
    }
  }
  return 0;
}

type Offset = { dx: number; dy: number };
type OffsetMap = Record<string, Offset>;

function readStoredOffsets(workspaceId: string | undefined): OffsetMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      `${HIERARCHY_POS_KEY}:${workspaceId ?? "_"}`,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<Offset>>;
    const out: OffsetMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (
        value &&
        Number.isFinite(value.dx) &&
        Number.isFinite(value.dy) &&
        (value.dx !== 0 || value.dy !== 0)
      ) {
        out[id] = { dx: value.dx!, dy: value.dy! };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStoredOffsets(
  workspaceId: string | undefined,
  offsets: OffsetMap,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${HIERARCHY_POS_KEY}:${workspaceId ?? "_"}`,
      JSON.stringify(offsets),
    );
  } catch {
    /* ignore */
  }
}

function HierarchyCard({
  entity,
  label,
  active,
  isDragging,
  style,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardPointerCancel,
  onSelect,
  onAddChild,
  onAddDocuments,
}: {
  entity: Entity;
  label: string;
  active?: boolean;
  isDragging?: boolean;
  style: CSSProperties;
  onCardPointerDown: (
    event: PointerEvent<HTMLElement>,
    entityId: string,
  ) => void;
  onCardPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onCardPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onCardPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onSelect: (entityId: string) => void;
  onAddChild?: (entityId: string) => void;
  onAddDocuments?: (entityId: string) => void;
}) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  return (
    <article
      className={`hierarchy-card${active ? " is-active" : ""}${
        isDragging ? " is-dragging" : ""
      }${isDropTarget ? " is-drop-target" : ""}`}
      style={style}
      data-entity-id={entity.id}
      onPointerDown={(event) => onCardPointerDown(event, entity.id)}
      onPointerMove={onCardPointerMove}
      onPointerUp={onCardPointerUp}
      onPointerCancel={onCardPointerCancel}
      onClick={() => onSelect(entity.id)}
      onDragEnter={(event) => {
        if (!event.dataTransfer?.types?.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        setIsDropTarget(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer?.types?.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setIsDropTarget(true);
      }}
      onDragLeave={(event) => {
        event.stopPropagation();
        setIsDropTarget(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDropTarget(false);
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0) return;
        window.dispatchEvent(
          new CustomEvent("layerum:entity-files-dropped", {
            detail: { entityId: entity.id, files },
          }),
        );
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(entity.id);
        }
      }}
    >
      <div className="hierarchy-card-head">
        <span>{active ? "ACTIVE NODE" : label.toUpperCase()}</span>
      </div>
      <h3>{entity.name}</h3>
      <p className={`hierarchy-entity-id ${mono.className}`}>
        {shortEntityId(entity.id)}
      </p>
      <div className="hierarchy-docs-row">
        <span>
          <FileText size={12} /> {inferDocCount(entity)} docs
        </span>
      </div>
      {onAddChild ? (
        <button
          type="button"
          className="hierarchy-add-child"
          onClick={(event) => {
            event.stopPropagation();
            onAddChild(entity.id);
          }}
        >
          <Plus size={12} /> Add Child
        </button>
      ) : null}
      {onAddDocuments ? (
        <button
          type="button"
          className="hierarchy-add-child hierarchy-add-docs"
          onClick={(event) => {
            event.stopPropagation();
            onAddDocuments(entity.id);
          }}
        >
          <FileUp size={12} /> Add Documents
        </button>
      ) : null}
    </article>
  );
}

function HierarchySkeletonCard({ id }: { id: string }) {
  return (
    <div key={id} className="hierarchy-skeleton-card" aria-hidden="true">
      <div className="hierarchy-skeleton-block w-label" />
      <div className="hierarchy-skeleton-block w-title" />
      <div className="hierarchy-skeleton-block w-id" />
      <div className="hierarchy-skeleton-docs">
        <div className="hierarchy-skeleton-block w-docs" />
        <div className="hierarchy-skeleton-block w-count" />
      </div>
      <div className="hierarchy-skeleton-block w-button" />
      <div className="hierarchy-skeleton-block w-button" />
    </div>
  );
}

function HierarchySkeleton() {
  return (
    <div className="hierarchy-skeleton" role="status" aria-label="Loading hierarchy">
      <div className="hierarchy-skeleton-row">
        <HierarchySkeletonCard id="skeleton-root" />
      </div>
      <div className="hierarchy-skeleton-link-v" aria-hidden="true" />
      <div className="hierarchy-skeleton-row">
        {["skeleton-a", "skeleton-b", "skeleton-c"].map((id) => (
          <HierarchySkeletonCard key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

const GRAPH_WIDTH = 544;
const CARD_WIDTH = 240;
const CARD_HEIGHT = 172;
const CARD_GAP = 64;
const TREE_GAP = 112;
const VERTICAL_GAP = 64;
const ROOT_NODE_Y = 86;
const DRAG_THRESHOLD = 4;
const INSPECTOR_GHOST_CLICK_GUARD_MS = 350;
const HIERARCHY_POS_KEY = "layerum:hierarchy-pos";
const FIT_VIEW_PADDING = 96;
const MINIMAP_WIDTH = 176;
const MINIMAP_HEIGHT = 120;
const MINIMAP_PADDING = 56;
const MIN_CANVAS_SCALE = 0.05;
const FIT_CANVAS_MIN_SCALE = 0.2;
const MAX_CANVAS_SCALE = 2.2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function HierarchyPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { workspaceId } = use(params);
  const access = useWorkspaceAccess();
  const canRunQuery = access.can({ type: 'permission', permission: 'query.run' });
  const queryClient = useQueryClient();

  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [inspectorTab, setInspectorTab] = useState<"details" | "documents">("details");
  const [activeDocCount, setActiveDocCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeName, setTypeName] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [entityName, setEntityName] = useState("");
  const [entityDescription, setEntityDescription] = useState("");
  const [entityTypeId, setEntityTypeId] = useState("");
  const [entityParentId, setEntityParentId] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
  const [cardHeights, setCardHeights] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [dragOffsets, setDragOffsets] = useState<OffsetMap>({});
  const [draggingEntityId, setDraggingEntityId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Entity | null>(null);
  const [canvasState, setCanvasState] = useState({ x: 0, y: 0, scale: 1 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
  });
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    distance: number;
    midpointX: number;
    midpointY: number;
    startScale: number;
    startX: number;
    startY: number;
  } | null>(null);
  const panMovedRef = useRef(false);
  const justPannedRef = useRef(false);
  const pressedOnEmptyRef = useRef(false);
  const hasInteractedRef = useRef(false);

  const cachedTypes = useMemo(
    () => readCachedQuery<EntityType[]>(`entity-types:${workspaceId}`),
    [workspaceId],
  );
  const cachedTree = useMemo(
    () => readCachedQuery<Entity[]>(`entities-tree:${workspaceId}`),
    [workspaceId],
  );

  const entityTypes = useQuery({
    queryKey: ["entity-types", workspaceId],
    queryFn: () => api.listEntityTypes(token!, workspaceId),
    enabled: Boolean(token && canRunQuery),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    initialData: cachedTypes?.data,
    initialDataUpdatedAt: cachedTypes?.updatedAt,
  });

  const tree = useQuery({
    queryKey: ["entities-tree", workspaceId],
    queryFn: () => api.listEntityTree(token!, workspaceId),
    enabled: Boolean(token && canRunQuery),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    initialData: cachedTree?.data,
    initialDataUpdatedAt: cachedTree?.updatedAt,
  });

  useEffect(() => {
    if (entityTypes.data) {
      writeCachedQuery(
        `entity-types:${workspaceId}`,
        entityTypes.data,
        entityTypes.dataUpdatedAt || Date.now(),
      );
    }
  }, [entityTypes.data, entityTypes.dataUpdatedAt, workspaceId]);

  useEffect(() => {
    if (tree.data) {
      writeCachedQuery(
        `entities-tree:${workspaceId}`,
        tree.data,
        tree.dataUpdatedAt || Date.now(),
      );
    }
  }, [tree.data, tree.dataUpdatedAt, workspaceId]);

  const allEntities = useMemo(
    () => flattenEntities(tree.data ?? []),
    [tree.data],
  );

  const createType = useMutation({
    mutationFn: () =>
      api.createEntityType(token!, workspaceId, {
        name: typeName,
        label: typeLabel,
      }),
    onSuccess: () => {
      toast.success("Entity type created");
      setTypeName("");
      setTypeLabel("");
      setTypeOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["entity-types", workspaceId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createEntity = useMutation({
    mutationFn: () =>
      api.createEntity(token!, workspaceId, {
        entity_type_id: entityTypeId,
        name: entityName,
        description: entityDescription || undefined,
        parent_id: entityParentId || undefined,
      }),
    onSuccess: () => {
      toast.success("Entity created");
      setEntityName("");
      setEntityDescription("");
      setEntityParentId("");
      setEntityOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["entities-tree", workspaceId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEntity = useMutation({
    mutationFn: (entityId: string) =>
      api.deleteEntity(token!, workspaceId, entityId),
    onSuccess: () => {
      toast.success("Entity deleted");
      setArchiveTarget(null);
      queryClient.invalidateQueries({
        queryKey: ["entities-tree", workspaceId],
      });
      setSelectedEntityId("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const searchTerm = searchQuery.trim().toLowerCase();
  const entityById = useMemo(() => {
    const map = new Map<string, Entity>();
    for (const entity of allEntities) {
      map.set(entity.id, entity);
    }
    return map;
  }, [allEntities]);

  const visibleEntityIds = useMemo(() => {
    if (!searchTerm) return new Set(allEntities.map((entity) => entity.id));
    const ids = new Set<string>();
    const matched = allEntities.filter((entity) =>
      entity.name.toLowerCase().includes(searchTerm),
    );
    for (const entity of matched) {
      let cursor: Entity | undefined = entity;
      while (cursor) {
        ids.add(cursor.id);
        if (!cursor.parent_id) break;
        cursor = entityById.get(cursor.parent_id);
      }
    }
    return ids;
  }, [allEntities, entityById, searchTerm]);

  const activeEntity = useMemo(() => {
    if (!selectedEntityId) return null;
    const entity =
      allEntities.find((item) => item.id === selectedEntityId) ?? null;
    if (!entity) return null;
    if (searchTerm && !visibleEntityIds.has(entity.id)) return null;
    return entity;
  }, [allEntities, searchTerm, selectedEntityId, visibleEntityIds]);

  const scope = useQuery({
    queryKey: ["entity-scope", workspaceId, activeEntity?.id],
    queryFn: () => api.getEntityScope(token!, workspaceId, activeEntity!.id),
    enabled: Boolean(token && activeEntity?.id),
  });

  useEffect(() => {
    setActiveDocCount(0);
  }, [selectedEntityId]);

  useEffect(() => {
    function onEntityFilesDropped(event: Event) {
      const detail = (event as CustomEvent<{ entityId: string }>).detail;
      if (!detail?.entityId) return;
      setSelectedEntityId(detail.entityId);
      setInspectorTab("documents");
    }
    window.addEventListener("layerum:entity-files-dropped", onEntityFilesDropped);
    return () => window.removeEventListener("layerum:entity-files-dropped", onEntityFilesDropped);
  }, []);

  const filteredRoots = useMemo(() => {
    const filterNode = (node: Entity): Entity | null => {
      if (!visibleEntityIds.has(node.id)) return null;
      const children = (node.children ?? [])
        .map((child) => filterNode(child))
        .filter(Boolean) as Entity[];
      return { ...node, children };
    };
    return (tree.data ?? [])
      .map((root) => filterNode(root))
      .filter(Boolean) as Entity[];
  }, [tree.data, visibleEntityIds]);

  const layout = useMemo(() => {
    type LayoutNode = {
      entity: Entity;
      children: LayoutNode[];
      subtreeWidth: number;
    };

    const nodePos = new Map<string, { x: number; y: number }>();
    const edges: Array<{ from: string; to: string }> = [];
    const rootIds = new Set<string>();

    const buildLayout = (node: Entity): LayoutNode => {
      const children = (node.children ?? []).map((child) => buildLayout(child));
      if (!children.length) {
        return {
          entity: node,
          children,
          subtreeWidth: CARD_WIDTH,
        };
      }
      const childrenWidth =
        children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
        Math.max(0, children.length - 1) * CARD_GAP;
      return {
        entity: node,
        children,
        subtreeWidth: Math.max(CARD_WIDTH, childrenWidth),
      };
    };

    let cursorX = 0;
    let maxY = 0;

    const placeLayout = (
      node: LayoutNode,
      left: number,
      top: number,
      parentId: string | null,
    ) => {
      const center = left + node.subtreeWidth / 2;
      const height = cardHeights.get(node.entity.id) ?? CARD_HEIGHT;
      nodePos.set(node.entity.id, { x: center, y: top });
      if (parentId) edges.push({ from: parentId, to: node.entity.id });
      if (!node.children.length) {
        maxY = Math.max(maxY, top + height);
        return;
      }

      const childrenTotalWidth =
        node.children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
        Math.max(0, node.children.length - 1) * CARD_GAP;
      let childCursor = left + (node.subtreeWidth - childrenTotalWidth) / 2;
      for (const child of node.children) {
        placeLayout(
          child,
          childCursor,
          top + height + VERTICAL_GAP,
          node.entity.id,
        );
        childCursor += child.subtreeWidth + CARD_GAP;
      }
    };

    for (const root of filteredRoots) {
      const layoutRoot = buildLayout(root);
      rootIds.add(root.id);
      placeLayout(layoutRoot, cursorX, ROOT_NODE_Y, null);
      cursorX += layoutRoot.subtreeWidth + TREE_GAP;
    }

    const width = Math.max(GRAPH_WIDTH, Math.max(0, cursorX - TREE_GAP));
    const height = nodePos.size ? Math.max(maxY + 132, 540) : 540;

    return { nodePos, edges, rootIds, width, height };
  }, [filteredRoots, cardHeights]);

  const resolvedNodes = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const [id, pos] of layout.nodePos) {
      const offset = dragOffsets[id];
      map.set(id, {
        x: pos.x + (offset?.dx ?? 0),
        y: pos.y + (offset?.dy ?? 0),
      });
    }
    return map;
  }, [layout, dragOffsets]);

  const edgePaths = useMemo(() => {
    const paths: Array<{ id: string; d: string; active: boolean }> = [];
    for (const edge of layout.edges) {
      const from = resolvedNodes.get(edge.from);
      const to = resolvedNodes.get(edge.to);
      if (!from || !to) continue;
      const fromHeight = cardHeights.get(edge.from) ?? CARD_HEIGHT;
      const fx = from.x;
      const fy = from.y + fromHeight;
      const tx = to.x;
      const ty = to.y;
      const midY = (fy + ty) / 2;
      paths.push({
        id: `${edge.from}->${edge.to}`,
        d: `M ${fx} ${fy} C ${fx} ${midY} ${tx} ${midY} ${tx} ${ty}`,
        active: edge.from === selectedEntityId || edge.to === selectedEntityId,
      });
    }
    return paths;
  }, [layout, resolvedNodes, cardHeights, selectedEntityId]);

  const contentBounds = useMemo(() => {
    if (!resolvedNodes.size) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [id, pos] of resolvedNodes) {
      minX = Math.min(minX, pos.x - CARD_WIDTH / 2);
      maxX = Math.max(maxX, pos.x + CARD_WIDTH / 2);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + (cardHeights.get(id) ?? CARD_HEIGHT));
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [resolvedNodes, cardHeights]);

  const minimapNodes = useMemo(() => {
    const points: Array<{ id: string; x: number; y: number; active: boolean }> =
      [];
    for (const [id, pos] of resolvedNodes) {
      points.push({
        id,
        x: pos.x,
        y: pos.y + (cardHeights.get(id) ?? CARD_HEIGHT) / 2,
        active: id === selectedEntityId,
      });
    }
    return points;
  }, [resolvedNodes, cardHeights, selectedEntityId]);

  function onCreateType(event: FormEvent) {
    event.preventDefault();
    createType.mutate();
  }

  function onCreateEntity(event: FormEvent) {
    event.preventDefault();
    if (!entityTypeId) {
      toast.error("Select entity type");
      return;
    }
    createEntity.mutate();
  }

  function openCreateEntity(parentId?: string) {
    setEntityParentId(parentId ?? "");
    setEntityOpen(true);
  }

  function openAddDocuments(entityId: string) {
    setSelectedEntityId(entityId);
    setInspectorTab("documents");
  }

  function handlePageClick(event: MouseEvent<HTMLDivElement>) {
    if (justPannedRef.current) {
      justPannedRef.current = false;
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".hierarchy-card")) return;
    if (target.closest(".hierarchy-inspector")) return;
    if (target.closest(".hierarchy-actions-floating")) return;
    // Select dropdown menus portal to document.body (outside the inspector
    // in the DOM), but React still dispatches their clicks through this
    // capture handler via the fiber tree. Without this guard, picking an
    // option clears the selection, unmounts the inspector panel, and destroys
    // the open modal + form state.
    if (target.closest(".layerum-select-menu-portal")) return;
    setSelectedEntityId("");
    setDialOpen(false);
  }

  const cardClickSuppressedRef = useRef(false);
  const inspectorOpenedAtRef = useRef(0);
  const cardDragRef = useRef<{
    entityId: string;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    subtreeIds: string[];
    startOffsets: OffsetMap;
  } | null>(null);

  const childIdsByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entity of allEntities) {
      if (!entity.parent_id) continue;
      const list = map.get(entity.parent_id);
      if (list) list.push(entity.id);
      else map.set(entity.parent_id, [entity.id]);
    }
    return map;
  }, [allEntities]);

  const collectSubtreeIds = useCallback(
    (entityId: string) => {
      const out: string[] = [];
      const stack = [entityId];
      while (stack.length) {
        const id = stack.pop()!;
        out.push(id);
        const children = childIdsByParent.get(id);
        if (children) stack.push(...children);
      }
      return out;
    },
    [childIdsByParent],
  );

  function handleCardPointerDown(
    event: PointerEvent<HTMLElement>,
    entityId: string,
  ) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select")) return;
    event.stopPropagation();
    event.preventDefault();
    cardClickSuppressedRef.current = false;
    const subtreeIds = collectSubtreeIds(entityId);
    cardDragRef.current = {
      entityId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      subtreeIds,
      startOffsets: Object.fromEntries(
        subtreeIds.map((id) => [id, dragOffsets[id] ?? { dx: 0, dy: 0 }]),
      ),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCardPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = cardDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      setDraggingEntityId(drag.entityId);
    }
    const scale = canvasState.scale || 1;
    const worldDeltaX = deltaX / scale;
    const worldDeltaY = deltaY / scale;
    setDragOffsets((prev) => {
      const next = { ...prev };
      for (const id of drag.subtreeIds) {
        const start = drag.startOffsets[id] ?? { dx: 0, dy: 0 };
        next[id] = {
          dx: start.dx + worldDeltaX,
          dy: start.dy + worldDeltaY,
        };
      }
      return next;
    });
  }

  function handleCardPointerUp(event: PointerEvent<HTMLElement>) {
    const drag = cardDragRef.current;
    cardDragRef.current = null;
    setDraggingEntityId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag || drag.pointerId !== event.pointerId || !drag.moved) return;
    cardClickSuppressedRef.current = true;
    setDragOffsets((current) => {
      writeStoredOffsets(workspaceId, current);
      return current;
    });
  }

  function selectEntityFromCard(entityId: string) {
    if (cardClickSuppressedRef.current) {
      cardClickSuppressedRef.current = false;
      return;
    }
    inspectorOpenedAtRef.current = performance.now();
    setSelectedEntityId(entityId);
  }

  function blockInspectorGhostClick(event: MouseEvent<HTMLElement>) {
    if (performance.now() - inspectorOpenedAtRef.current >= INSPECTOR_GHOST_CLICK_GUARD_MS) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleCardPointerCancel(event: PointerEvent<HTMLElement>) {
    const drag = cardDragRef.current;
    cardDragRef.current = null;
    setDraggingEntityId(null);
    if (drag && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const fitCanvasView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setCanvasSize({ width: rect.width, height: rect.height });

    if (!contentBounds || !contentBounds.width || !contentBounds.height) {
      setCanvasState({ x: 0, y: 0, scale: 1 });
      return;
    }

    const availableWidth = Math.max(1, rect.width - FIT_VIEW_PADDING);
    const availableHeight = Math.max(1, rect.height - FIT_VIEW_PADDING);
    const scale = clamp(
      Math.min(
        availableWidth / contentBounds.width,
        availableHeight / contentBounds.height,
        1,
      ),
      FIT_CANVAS_MIN_SCALE,
      1,
    );

    setCanvasState({
      scale,
      x: (rect.width - contentBounds.width * scale) / 2 - contentBounds.minX * scale,
      y: (rect.height - contentBounds.height * scale) / 2 - contentBounds.minY * scale,
    });
  }, [contentBounds]);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setCanvasSize({ width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    if (!dialOpen) return;
    function onDialEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDialOpen(false);
    }
    window.addEventListener("keydown", onDialEscape);
    return () => window.removeEventListener("keydown", onDialEscape);
  }, [dialOpen]);

  function handleCanvasWheel(event: WheelEvent<HTMLDivElement>) {
    if (!canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const zoomStep = event.deltaY < 0 ? 1.08 : 0.92;
    setCanvasState((prev) => {
      const nextScale = clamp(prev.scale * zoomStep, MIN_CANVAS_SCALE, MAX_CANVAS_SCALE);
      if (nextScale === prev.scale) return prev;

      const rect = canvasRef.current!.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const worldX = (pointerX - prev.x) / prev.scale;
      const worldY = (pointerY - prev.y) / prev.scale;

      hasInteractedRef.current = true;
      return {
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
      };
    });
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".hierarchy-card")) return;
    if (target.closest("button, input, textarea, select, a")) return;
    if (event.button !== 0) return;

    event.preventDefault();
    pressedOnEmptyRef.current = true;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activePointersRef.current.size >= 2) {
      const [first, second] = Array.from(activePointersRef.current.values());
      const rect = event.currentTarget.getBoundingClientRect();
      pinchRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        midpointX: (first.x + second.x) / 2 - rect.left,
        midpointY: (first.y + second.y) / 2 - rect.top,
        startScale: canvasState.scale,
        startX: canvasState.x,
        startY: canvasState.y,
      };
      dragRef.current.active = false;
      dragRef.current.pointerId = -1;
      panMovedRef.current = false;
      setIsPanning(false);
      return;
    }

    dragRef.current.active = true;
    dragRef.current.pointerId = event.pointerId;
    dragRef.current.lastX = event.clientX;
    dragRef.current.lastY = event.clientY;
    panMovedRef.current = false;
    setIsPanning(true);
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinchRef.current && activePointersRef.current.size >= 2) {
      event.preventDefault();
      const [first, second] = Array.from(activePointersRef.current.values());
      const rect = event.currentTarget.getBoundingClientRect();
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (!distance || !pinchRef.current.distance) return;
      const nextScale = clamp(
        pinchRef.current.startScale * (distance / pinchRef.current.distance),
        MIN_CANVAS_SCALE,
        MAX_CANVAS_SCALE,
      );
      const midpointX = (first.x + second.x) / 2 - rect.left;
      const midpointY = (first.y + second.y) / 2 - rect.top;
      const worldX = (pinchRef.current.midpointX - pinchRef.current.startX) / pinchRef.current.startScale;
      const worldY = (pinchRef.current.midpointY - pinchRef.current.startY) / pinchRef.current.startScale;

      panMovedRef.current = true;
      hasInteractedRef.current = true;
      setCanvasState({
        scale: nextScale,
        x: midpointX - worldX * nextScale,
        y: midpointY - worldY * nextScale,
      });
      return;
    }

    if (
      !dragRef.current.active ||
      dragRef.current.pointerId !== event.pointerId
    )
      return;
    event.preventDefault();
    const deltaX = event.clientX - dragRef.current.lastX;
    const deltaY = event.clientY - dragRef.current.lastY;
    if (deltaX === 0 && deltaY === 0) return;
    panMovedRef.current = true;
    dragRef.current.lastX = event.clientX;
    dragRef.current.lastY = event.clientY;
    hasInteractedRef.current = true;
    setCanvasState((prev) => ({
      ...prev,
      x: prev.x + deltaX,
      y: prev.y + deltaY,
    }));
  }

  function handleCanvasPointerUp(event: PointerEvent<HTMLDivElement>) {
    activePointersRef.current.delete(event.pointerId);
    if (pinchRef.current && activePointersRef.current.size < 2) {
      pinchRef.current = null;
      const remainingPointer = Array.from(activePointersRef.current.entries())[0];
      if (remainingPointer) {
        const [pointerId, pointer] = remainingPointer;
        dragRef.current.active = true;
        dragRef.current.pointerId = pointerId;
        dragRef.current.lastX = pointer.x;
        dragRef.current.lastY = pointer.y;
      }
    } else if (dragRef.current.pointerId === event.pointerId) {
      dragRef.current.active = false;
      dragRef.current.pointerId = -1;
    }

    if (panMovedRef.current) {
      justPannedRef.current = true;
    }
    if (pressedOnEmptyRef.current && !panMovedRef.current) {
      pressedOnEmptyRef.current = false;
      setSelectedEntityId("");
      setDialOpen(false);
    }
    pressedOnEmptyRef.current = false;
    setIsPanning(dragRef.current.active);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    setDragOffsets(readStoredOffsets(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (!layout.nodePos.size) return;
    if (hasInteractedRef.current) return;
    fitCanvasView();
  }, [layout, fitCanvasView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cards = canvas.querySelectorAll<HTMLElement>("[data-entity-id]");
    if (!cards.length) {
      if (cardHeights.size) setCardHeights(new Map());
      return;
    }
    setCardHeights((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const card of cards) {
        const id = card.dataset.entityId;
        if (!id) continue;
        const height = card.offsetHeight;
        if (height && next.get(id) !== height) {
          next.set(id, height);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [layout, cardHeights]);

  useEffect(() => {
    const onResize = () => {
      syncCanvasSize();
      if (hasInteractedRef.current) return;
      fitCanvasView();
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitCanvasView, syncCanvasSize]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      syncCanvasSize();
      if (!hasInteractedRef.current) fitCanvasView();
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeEntity, fitCanvasView, syncCanvasSize]);

  function resetCanvasView() {
    hasInteractedRef.current = false;
    setDragOffsets({});
    try {
      window.localStorage.removeItem(`${HIERARCHY_POS_KEY}:${workspaceId ?? "_"}`);
    } catch {
      /* ignore */
    }
    fitCanvasView();
  }

  const viewLeftWorld = -canvasState.x / canvasState.scale;
  const viewTopWorld = -canvasState.y / canvasState.scale;
  const viewWidthWorld = canvasSize.width / canvasState.scale;
  const viewHeightWorld = canvasSize.height / canvasState.scale;
  const viewRightWorld = viewLeftWorld + viewWidthWorld;
  const viewBottomWorld = viewTopWorld + viewHeightWorld;
  const minimapBounds = useMemo(() => {
    const nodeXs = minimapNodes.map((node) => node.x);
    const nodeYs = minimapNodes.map((node) => node.y);
    const contentMinX = nodeXs.length ? Math.min(...nodeXs) : 0;
    const contentMaxX = nodeXs.length
      ? Math.max(...nodeXs)
      : layout.width;
    const contentMinY = nodeYs.length ? Math.min(...nodeYs) : 0;
    const contentMaxY = nodeYs.length
      ? Math.max(...nodeYs)
      : layout.height;

    const minX = Math.min(contentMinX, viewLeftWorld) - MINIMAP_PADDING;
    const maxX = Math.max(contentMaxX, viewRightWorld) + MINIMAP_PADDING;
    const minY = Math.min(contentMinY, viewTopWorld) - MINIMAP_PADDING;
    const maxY = Math.max(contentMaxY, viewBottomWorld) + MINIMAP_PADDING;

    const rangeX = Math.max(1, maxX - minX);
    const rangeY = Math.max(1, maxY - minY);

    return { minX, minY, rangeX, rangeY };
  }, [
    layout.height,
    layout.width,
    minimapNodes,
    viewBottomWorld,
    viewLeftWorld,
    viewRightWorld,
    viewTopWorld,
  ]);

  const minimapViewportStyle: CSSProperties = {
    left: `${((viewLeftWorld - minimapBounds.minX) / minimapBounds.rangeX) * MINIMAP_WIDTH}px`,
    top: `${((viewTopWorld - minimapBounds.minY) / minimapBounds.rangeY) * MINIMAP_HEIGHT}px`,
    width: `${Math.max(10, (viewWidthWorld / minimapBounds.rangeX) * MINIMAP_WIDTH)}px`,
    height: `${Math.max(8, (viewHeightWorld / minimapBounds.rangeY) * MINIMAP_HEIGHT)}px`,
  };

  if (!canRunQuery) {
    return (
      <div className={`layerum-page hierarchy-page ${inter.className}`}>
        <WorkspaceTopbar
          section="Hierarchy Builder"
          page="Hierarchy"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search nodes..."
        />
        <WorkspaceAccessGate
          requirement={{ type: 'permission', permission: 'query.run' }}
          title="Hierarchy access required"
          description="You need the Run queries permission to view the hierarchy."
        >
          <div />
        </WorkspaceAccessGate>
      </div>
    );
  }

  return (
    <div
      className={`layerum-page hierarchy-page ${inter.className}`}
      onClickCapture={handlePageClick}
    >
      <WorkspaceTopbar
        section="Hierarchy Builder"
        page="Hierarchy"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search nodes..."
      />

      <section
        className={`hierarchy-main ${activeEntity ? "inspector-open" : ""}`}
      >
        <div
          className={`hierarchy-canvas ${isPanning ? "is-panning" : ""}`}
          ref={(node) => {
            canvasRef.current = node;
          }}
          onWheel={handleCanvasWheel}
          onWheelCapture={handleCanvasWheel}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          style={
            {
              "--hierarchy-grid-size": `${72 * canvasState.scale}px`,
              "--hierarchy-grid-x": `${canvasState.x}px`,
              "--hierarchy-grid-y": `${canvasState.y}px`,
            } as CSSProperties
          }
        >
          {layout.nodePos.size ? (
            <div
              className="hierarchy-world"
              style={{
                transform: `translate(${canvasState.x}px, ${canvasState.y}px) scale(${canvasState.scale})`,
              }}
            >
              <div
                className="hierarchy-graph"
                style={{
                  width: layout.width,
                  height: layout.height,
                }}
              >
                <svg
                  className="hierarchy-edges"
                  width={layout.width}
                  height={layout.height}
                  aria-hidden="true"
                >
                  {edgePaths.map((edge) => (
                    <g
                      key={edge.id}
                      className={`hierarchy-edge${edge.active ? " active" : ""}`}
                    >
                      <path className="hierarchy-edge-base" d={edge.d} />
                      <path className="hierarchy-edge-pulse" d={edge.d} />
                    </g>
                  ))}
                </svg>
                {Array.from(layout.nodePos.keys()).map((entityId) => {
                  const entity = entityById.get(entityId);
                  const pos = resolvedNodes.get(entityId);
                  if (!entity || !pos) return null;
                  return (
                    <HierarchyCard
                      key={entityId}
                      entity={entity}
                      label={
                        entity.entity_type?.label ??
                        (layout.rootIds.has(entityId) ? "Root" : "Node")
                      }
                      active={selectedEntityId === entityId}
                      isDragging={draggingEntityId === entityId}
                      style={{
                        left: `${pos.x - CARD_WIDTH / 2}px`,
                        top: `${pos.y}px`,
                      }}
                      onCardPointerDown={handleCardPointerDown}
                      onCardPointerMove={handleCardPointerMove}
                      onCardPointerUp={handleCardPointerUp}
                      onCardPointerCancel={handleCardPointerCancel}
                      onSelect={selectEntityFromCard}
                      onAddChild={openCreateEntity}
                      onAddDocuments={openAddDocuments}
                    />
                  );
                })}
              </div>
            </div>
          ) : tree.isLoading ? (
            <div className="hierarchy-loading">
              <HierarchySkeleton />
            </div>
          ) : (
            <div className="hierarchy-empty">
              {searchTerm
                ? "No entities match your search."
                : "No entities found. Create your first entity to start building the hierarchy."}
            </div>
          )}

          {layout.nodePos.size ? (
            <aside className="hierarchy-minimap" aria-hidden="true">
              <div className="hierarchy-minimap-body">
                <div
                  className="hierarchy-minimap-viewport"
                  style={minimapViewportStyle}
                />
                {minimapNodes.map((node) => {
                  const x =
                    ((node.x - minimapBounds.minX) / minimapBounds.rangeX) *
                    MINIMAP_WIDTH;
                  const y =
                    ((node.y - minimapBounds.minY) / minimapBounds.rangeY) *
                    MINIMAP_HEIGHT;
                  return (
                    <span
                      key={node.id}
                      className={`hierarchy-minimap-node ${node.active ? "active" : ""}`}
                      style={{ left: `${x}px`, top: `${y}px` }}
                    />
                  );
                })}
              </div>
            </aside>
          ) : null}

          <div className={`hierarchy-actions-floating${dialOpen ? " dial-open" : ""}`}>
            <button
              type="button"
              className="hierarchy-dial-action"
              style={{ "--d": 1 } as CSSProperties}
              onClick={() => {
                setDialOpen(false);
                setEntityOpen(true);
              }}
              aria-label="Create entity"
            >
              <FilePlus2 size={16} />
              <span className="hierarchy-dial-tip" aria-hidden="true">Create entity</span>
            </button>
            <button
              type="button"
              className="hierarchy-dial-action"
              style={{ "--d": 2 } as CSSProperties}
              onClick={() => {
                setDialOpen(false);
                setTypeOpen(true);
              }}
              aria-label="Create entity type"
            >
              <Shapes size={16} />
              <span className="hierarchy-dial-tip" aria-hidden="true">Create entity type</span>
            </button>
            <button
              type="button"
              className="hierarchy-dial-action"
              style={{ "--d": 3 } as CSSProperties}
              onClick={() => {
                setDialOpen(false);
                resetCanvasView();
              }}
              aria-label="Reset canvas view"
            >
              <RotateCcw size={15} />
              <span className="hierarchy-dial-tip" aria-hidden="true">Reset view</span>
            </button>
            <button
              type="button"
              className="hierarchy-dial-main"
              onClick={() => setDialOpen((current) => !current)}
              aria-expanded={dialOpen}
              aria-label={dialOpen ? "Close actions menu" : "Open actions menu"}
              title={dialOpen ? "Close" : "Actions"}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {activeEntity ? <div className="hierarchy-inspector-backdrop" aria-hidden="true" /> : null}

        <aside className="hierarchy-inspector" onClickCapture={blockInspectorGhostClick}>
          {activeEntity ? (
            <div className="hierarchy-inspector-inner">
              <header>
                <h2>{activeEntity.name}</h2>
                <span>Active</span>
                <button
                  type="button"
                  className="hierarchy-inspector-close"
                  aria-label="Close entity panel"
                  onClick={() => setSelectedEntityId("")}
                >
                  <X size={15} />
                </button>
              </header>

              <div className="hierarchy-tabs" role="tablist" aria-label="Entity panel">
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === "details"}
                  className={`hierarchy-tab${inspectorTab === "details" ? " active" : ""}`}
                  onClick={() => setInspectorTab("details")}
                >
                  Details
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === "documents"}
                  className={`hierarchy-tab${inspectorTab === "documents" ? " active" : ""}`}
                  onClick={() => setInspectorTab("documents")}
                >
                  Documents{activeDocCount > 0 ? ` (${activeDocCount})` : ""}
                </button>
              </div>

              {inspectorTab === "details" ? (
                <>
                  <div className="hierarchy-field">
                    <label>Display Name</label>
                    <div className="hierarchy-input">{activeEntity.name}</div>
                  </div>

                  <div className="hierarchy-field">
                    <label>Entity Identifier</label>
                    <div className={`hierarchy-id-box ${mono.className}`}>
                      <span>{activeEntity.id}</span>
                      <Copy size={13} />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="hierarchy-archive"
                    disabled={deleteEntity.isPending}
                    onClick={() => setArchiveTarget(activeEntity)}
                  >
                    <Archive size={14} /> Delete Entity
                  </button>

                  <div className="hierarchy-scope">
                    <span>
                      <ShieldCheck size={12} /> System sync: 12ms ago
                    </span>
                    <div className="hierarchy-scope-tags">
                      {(scope.data?.entityIds ?? []).slice(0, 4).map((id) => (
                        <em key={id} className={mono.className}>
                          {id.slice(0, 8)}
                        </em>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <EntityDocumentsPanel
                  key={activeEntity.id}
                  workspaceId={workspaceId}
                  entityId={activeEntity.id}
                  entityName={activeEntity.name}
                  token={token}
                  onCountChange={setActiveDocCount}
                />
              )}
            </div>
          ) : null}
        </aside>
      </section>

      <Modal
        open={typeOpen}
        title="Create Entity Type"
        onOpenChange={setTypeOpen}
        disableClose={createType.isPending}
      >
        <form className="layerum-stack" onSubmit={onCreateType}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Type Name (System)</label>
            <p className="layerum-form-hint">
              Lowercase key used internally. Example: `project`.
            </p>
            <input
              className="layerum-input"
              placeholder="project"
              value={typeName}
              onChange={(event) => setTypeName(event.target.value)}
              required
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Type Label (Display)</label>
            <p className="layerum-form-hint">
              User-facing label shown across UI.
            </p>
            <input
              className="layerum-input"
              placeholder="Project"
              value={typeLabel}
              onChange={(event) => setTypeLabel(event.target.value)}
              required
            />
          </div>
          <button
            className="layerum-button"
            type="submit"
            disabled={createType.isPending}
          >
            Add type
          </button>
        </form>
      </Modal>

      <Modal
        open={entityOpen}
        title="Create Entity"
        onOpenChange={setEntityOpen}
        disableClose={createEntity.isPending}
      >
        <form className="layerum-stack" onSubmit={onCreateEntity}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Entity Name</label>
            <p className="layerum-form-hint">
              Business name of this node in your hierarchy.
            </p>
            <input
              className="layerum-input"
              placeholder="Entity name"
              value={entityName}
              onChange={(event) => setEntityName(event.target.value)}
              required
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Description</label>
            <p className="layerum-form-hint">
              Optional context to help users understand this entity.
            </p>
            <textarea
              className="layerum-textarea"
              placeholder="Description"
              value={entityDescription}
              onChange={(event) => setEntityDescription(event.target.value)}
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Entity Type</label>
            <p className="layerum-form-hint">
              Classifies the node (team, product, project, etc.).
            </p>
            <Select
              value={entityTypeId}
              onChange={setEntityTypeId}
              options={(entityTypes.data ?? []).map((type) => ({
                value: type.id,
                label: type.label,
              }))}
              placeholder="Select entity type"
              emptyLabel="No entity types yet"
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Parent Entity</label>
            <p className="layerum-form-hint">
              Leave empty to create a root-level entity.
            </p>
            <Select
              value={entityParentId}
              onChange={setEntityParentId}
              options={[
                { value: "", label: "No parent (root)" },
                ...allEntities.map((entity) => ({
                  value: entity.id,
                  label: entity.name,
                })),
              ]}
            />
          </div>
          <button
            className="layerum-button"
            type="submit"
            disabled={createEntity.isPending}
          >
            Add entity
          </button>
        </form>
      </Modal>

      <ConfirmDestructiveModal
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title="Delete Entity"
        description={
          archiveTarget ? (
            <>
              Delete entity <strong>{archiveTarget.name}</strong>. If it has
              child entities, all children and nested descendants will be
              deleted too.
            </>
          ) : (
            "This action is irreversible."
          )
        }
        confirmLabel="Delete entity"
        isPending={deleteEntity.isPending}
        onConfirm={() => {
          if (!archiveTarget) return;
          deleteEntity.mutate(archiveTarget.id);
        }}
      />
    </div>
  );
}
