<template>
  <div class="flow">
    <div v-if="isLoading || isLayouting" class="loading-overlay">
      <vscode-progress-ring></vscode-progress-ring>
      <span class="ml-2">{{ isLayouting ? 'Positioning graph...' : 'Loading lineage data...' }}</span>
    </div>
    <div v-else-if="error" class="error-message">
      <span class="ml-2">{{ error }}</span>
    </div>
    
    <!-- Asset View -->
    <VueFlow
      v-if="!showPipelineView && !showColumnView"
      v-model:elements="elements"
      :fit-view-on-init="false"
      class="basic-flow"
      :draggable="true"
      :node-draggable="true"
      @nodesDragged="onNodesDragged"
      ref="flowRef"
    >
      <Background />
 
      <template #node-custom="nodeProps">
        <CustomNode
          :expanded-nodes="expandedNodes"
          @toggle-node-expand="toggleNodeExpand"
          :data="nodeProps.data"
          :node-props="nodeProps"
          :label="nodeProps.data.label"
          :expand-all-downstreams="expandAllDownstreams"
          :expand-all-upstreams="expandAllUpstreams"
          @addUpstream="onAddUpstream"
          @addDownstream="onAddDownstream"
          @node-click="onNodeClick"
          :selected-node-id="selectedNodeId"
          :show-expand-buttons="filterType === 'direct'"
        />
      </template>
      
      <!-- Filter Panel -->
      <FilterTab
        :filter-type="filterType"
        :expand-all-upstreams="expandAllUpstreams"
        :expand-all-downstreams="expandAllDownstreams"
        :show-pipeline-view="showPipelineView"
        :show-column-view="showColumnView"
        @update:filter-type="(value) => { filterType = value; if (value === 'direct') expandedNodes = {}; }"
        @update:expand-all-upstreams="expandAllUpstreams = $event"
        @update:expand-all-downstreams="expandAllDownstreams = $event"
        @pipeline-view="handlePipelineView"
        @column-view="handleColumnLevelLineage"
        @asset-view="(filterState) => { if (filterState) handleAssetView({ assetId: props.assetDataset?.id, assetDataset: props.assetDataset, pipelineData: props.pipelineData, LineageError: props.LineageError, filterState }); }"
        @reset="handleReset"
      />
      
      <Controls
        :position="PanelPosition.BottomLeft"
        showZoom
        showFitView
        showInteractive
        class="custom-controls"
      />
    </VueFlow>
    
    <!-- Pipeline View - Using the separate PipelineLineage component -->
    <PipelineLineage
      v-if="showPipelineView"
      :assetDataset="props.assetDataset"
      :pipelineData="props.pipelineData"
      :isLoading="isLoading"
      :LineageError="props.LineageError"
      @showAssetView="handleAssetView"
      @showColumnView="handleColumnLevelLineage"
    />
    
    <!-- Column Level View - Using the separate ColumnLevelLineage component -->
    <ColumnLevelLineage
      v-if="showColumnView"
      :assetDataset="props.assetDataset"
      :pipelineData="props.pipelineData"
      :isLoading="isLoading"
      :LineageError="props.LineageError"
      @showPipelineView="handlePipelineView"
      @showAssetView="handleAssetView"
    />
  </div>
</template>

<script setup lang="ts">
import { PanelPosition, VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/controls/dist/style.css";
import type { NodeDragEvent, XYPosition, NodeMouseEvent, Edge } from "@vue-flow/core";
import { computed, onMounted, defineProps, watch, ref, nextTick, onUnmounted, shallowRef } from "vue";
import ELK from "elkjs/lib/elk.bundled.js";
import CustomNode from "@/components/lineage-flow/custom-nodes/CustomNodes.vue";
import PipelineLineage from "@/components/lineage-flow/pipeline-lineage/PipelineLineage.vue";
import ColumnLevelLineage from "@/components/lineage-flow/column-level/ColumnLevelLineage.vue";
import FilterTab from "@/components/lineage-flow/filterTab/filterTab.vue";
import {
  generateGraphFromJSON,
  generateGraphForDownstream,
  generateGraphForUpstream,
} from "@/utilities/graphGenerator";
import type { AssetDataset } from "@/types";
import { getAssetDataset } from "./useAssetLineage";

const props = defineProps<{
  assetDataset?: AssetDataset | null;
  pipelineData: any;
  isLoading: boolean;
  LineageError: string | null;
}>();

// Core Vue Flow state
const flowRef = ref(null);
const { nodes, edges, addNodes, addEdges, setNodes, setEdges, fitView, onNodeMouseEnter, onNodeMouseLeave, getNodes, getEdges } = useVueFlow();
const elements = computed(() => [...nodes.value, ...edges.value]);

// UI state
const selectedNodeId = ref<string | null>(null);
const showPipelineView = ref(false);
const showColumnView = ref(false);
const isLoading = ref(true);
const isLayouting = ref(false);
const error = ref<string | null>(props.LineageError);

// Filter state
const filterType = ref<"direct" | "all">("direct");
const expandAllDownstreams = ref(false);
const expandAllUpstreams = ref(false);
const expandedNodes = ref<{ [key: string]: boolean }>({});

// Layout
const elk = new ELK();

// Computed properties for performance

// Memoized base graph generation
const baseGraphData = computed(() => {
  if (!props.assetDataset) return { nodes: [], edges: [] };
  return generateGraphFromJSON(props.assetDataset);
});

// Memoized downstream assets
const allDownstreamAssets = computed(() => {
  if (!props.assetDataset?.downstream || !expandAllDownstreams.value) return [];
  
  return props.assetDataset.downstream.reduce((acc: any[], downstream: any) => {
    return acc.concat(fetchAllDownstreams(downstream.name));
  }, []);
});

// Memoized upstream assets  
const allUpstreamAssets = computed(() => {
  if (!props.assetDataset?.upstreams || !expandAllUpstreams.value) return [];
  
  return props.assetDataset.upstreams.reduce((acc: any[], upstream: any) => {
    return acc.concat(fetchAllUpstreams(upstream.name));
  }, []);
});

// Computed graph data based on current filter
const currentGraphData = computed(() => {
  if (filterType.value === "direct") {
    return baseGraphData.value;
  }
  
  if (filterType.value === "all") {
    let allNodes: any[] = [...baseGraphData.value.nodes];
    let allEdges: any[] = [...baseGraphData.value.edges];
    
    // Add downstream nodes/edges
    allDownstreamAssets.value.forEach((asset) => {
      const result = generateGraphForDownstream(asset.name, props.pipelineData);
      allNodes = [...allNodes, ...result.nodes];
      allEdges = [...allEdges, ...result.edges];
    });
    
    // Add upstream nodes/edges
    allUpstreamAssets.value.forEach((asset) => {
      const result = generateGraphForUpstream(
        asset.name,
        props.pipelineData,
        props.assetDataset?.id ?? ""
      );
      allNodes = [...allNodes, ...result.nodes];
      allEdges = [...allEdges, ...result.edges];
    });
    
    // Remove duplicates efficiently
    const nodeMap = new Map(allNodes.map(node => [node.id, node]));
    const edgeMap = new Map(allEdges.map(edge => [edge.id, edge]));
    
    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values())
    };
  }
  
  return { nodes: [], edges: [] };
});

/**
 * Recursive dependency traversal functions
 */
const fetchAllDownstreams = (assetName: string, downstreamAssets: any[] = []): any[] => {
  const currentAsset = props.pipelineData.assets.find((asset: any) => asset.name === assetName);
  if (!currentAsset) return downstreamAssets;

  const asset = getAssetDataset(props.pipelineData, currentAsset.id);
  downstreamAssets.push(asset);

  asset?.downstream?.forEach((downstreamAsset) => {
    fetchAllDownstreams(downstreamAsset.name, downstreamAssets);
  });

  return downstreamAssets;
};

const fetchAllUpstreams = (assetName: string, upstreamAssets: any[] = []): any[] => {
  const currentAsset = props.pipelineData.assets.find((asset: any) => asset.name === assetName);
  if (!currentAsset) return upstreamAssets;

  const asset = getAssetDataset(props.pipelineData, currentAsset.id);
  upstreamAssets.push(asset);

  asset?.upstreams?.forEach((upstreamAsset) => {
    fetchAllUpstreams(upstreamAsset.name, upstreamAssets);
  });

  return upstreamAssets;
};

/**
 * Utility functions for hover functionality
 */
const getUpstreamNodesAndEdges = (nodeId: string, allEdges: Edge[]) => {
  const upstreamNodes = new Set<string>([nodeId]);
  const upstreamEdges = new Set<Edge>();
  const queue = [nodeId];
  const visited = new Set<string>([nodeId]);

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    const incomingEdges = allEdges.filter((edge) => edge.target === currentNodeId);

    for (const edge of incomingEdges) {
      if (!visited.has(edge.source)) {
        visited.add(edge.source);
        upstreamNodes.add(edge.source);
        queue.push(edge.source);
      }
      upstreamEdges.add(edge);
    }
  }

  return { upstreamNodes, upstreamEdges };
};

const getDownstreamNodesAndEdges = (nodeId: string, allEdges: Edge[]) => {
  const downstreamNodes = new Set<string>([nodeId]);
  const downstreamEdges = new Set<Edge>();
  const queue = [nodeId];
  const visited = new Set<string>([nodeId]);

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    const outgoingEdges = allEdges.filter((edge) => edge.source === currentNodeId);

    for (const edge of outgoingEdges) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        downstreamNodes.add(edge.target);
        queue.push(edge.target);
      }
      downstreamEdges.add(edge);
    }
  }

  return { downstreamNodes, downstreamEdges };
};

/**
 * Node interaction handlers
 */
const onNodeClick = (nodeId: string) => {
  selectedNodeId.value = selectedNodeId.value === nodeId ? null : nodeId;
};

const onNodesDragged = (draggedNodes: NodeDragEvent[]) => {
  setNodes(
    nodes.value.map((node) => {
      const draggedNode = draggedNodes.find((n) => n.node.id === node.id);
      return draggedNode ? { ...node, position: draggedNode.node.position as XYPosition } : node;
    })
  );
};

/**
 * Single layout function that handles both initial and update cases
 */
const applyLayout = async (inputNodes?: any[], inputEdges?: any[]) => {
  const nodesToLayout = inputNodes || nodes.value;
  const edgesToLayout = inputEdges || edges.value;
  
  if (nodesToLayout.length === 0) return { nodes: [], edges: [] };
  
  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.spacing.nodeNode": "0.0",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "PREFER_NODES",
      "elk.layered.crossingMinimization.semiInteractive": "true",
      "elk.layered.unnecessaryBendpoints": "true",
    },
    children: nodesToLayout.map((node) => ({
      id: node.id,
      width: 150,
      height: 70,
      labels: [{ text: node.data.label }],
    })),
    edges: edgesToLayout.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layout = await elk.layout(elkGraph);
    
    if (layout.children && layout.children.length) {
      const layoutedNodes = nodesToLayout.map((node) => {
        const layoutNode = layout.children?.find((child: any) => child.id === node.id);
        return layoutNode
          ? {
              ...node,
              position: {
                x: layoutNode.x ?? 0,
                y: layoutNode.y ?? 0,
              },
              zIndex: 1,
            }
          : node;
      });
      
      return { nodes: layoutedNodes, edges: edgesToLayout };
    }
  } catch (error) {
    console.error("Failed to apply ELK layout:", error);
  }
  
  return { nodes: nodesToLayout, edges: edgesToLayout };
};

/**
 * Hover event handlers
 */
onNodeMouseEnter((event: NodeMouseEvent) => {
  const hoveredNode = event.node;
  const allNodes = getNodes.value;
  const allEdges = getEdges.value;

  const { upstreamNodes, upstreamEdges } = getUpstreamNodesAndEdges(hoveredNode.id, allEdges);
  const { downstreamNodes, downstreamEdges } = getDownstreamNodesAndEdges(hoveredNode.id, allEdges);

  const highlightNodes = new Set([...upstreamNodes, ...downstreamNodes]);
  const highlightEdges = new Set([...upstreamEdges, ...downstreamEdges]);

  allNodes.forEach((node) => {
    if (!highlightNodes.has(node.id)) {
      node.class = `${node.class || ''} faded`.trim();
    }
  });

  allEdges.forEach((edge) => {
    if (!highlightEdges.has(edge)) {
      edge.class = `${edge.class || ''} faded`.trim();
    }
  });
});

onNodeMouseLeave(() => {
  getNodes.value.forEach((node) => {
    if (node.class && typeof node.class === 'string') {
      node.class = node.class.replace(/faded/g, '').trim();
    }
  });
  getEdges.value.forEach((edge) => {
    if (edge.class && typeof edge.class === 'string') {
      edge.class = edge.class.replace(/faded/g, '').trim();
    }
  });
});

/**
 * Simplified graph update function using computed properties
 */
const updateGraph = async () => {
  if (!showPipelineView.value && !showColumnView.value) {
    isLayouting.value = true;
    
    try {
      const graphData = currentGraphData.value;
      
      // Pre-calculate layout positions to prevent flickering
      if (graphData.nodes.length > 0) {
        const layoutedGraphData = await applyLayout(graphData.nodes, graphData.edges);
        
        // Set nodes and edges with pre-calculated positions
        setNodes(layoutedGraphData.nodes);
        setEdges(layoutedGraphData.edges);
        
        // Wait for DOM update, then show the graph
        await nextTick();
        isLayouting.value = false;
        
        // Apply fit view immediately after layouting is done
        await nextTick();
        fitView({ padding: 0.2, duration: 300 });
      } else {
        setNodes([]);
        setEdges([]);
        isLayouting.value = false;
      }
    } catch (error) {
      console.error("Error updating graph:", error);
      isLayouting.value = false;
    }
  }
};

/**
 * Initialization and data processing
 */
const processProperties = async () => {
  if (!props.assetDataset || !props.pipelineData) {
    isLoading.value = error.value === null;
    return;
  }

  isLoading.value = true;
  isLayouting.value = false;
  error.value = null;

  try {
    await updateGraph();
    isLoading.value = false;
  } catch (err) {
    console.error("Error processing properties:", err);
    error.value = "Failed to generate lineage graph. Please try again.";
    isLoading.value = false;
    isLayouting.value = false;
  }
};

/**
 * Expand/collapse node functions
 */
const toggleNodeExpand = (nodeId: string) => {
  expandedNodes.value[nodeId] = !expandedNodes.value[nodeId];
};

const onAddUpstream = async (nodeId: string) => {
  isLayouting.value = true;
  
  const { nodes: newNodes, edges: newEdges } = generateGraphForUpstream(
    nodeId,
    props.pipelineData,
    props.assetDataset?.id ?? ""
  );
  
  // Filter out nodes that already exist
  const existingNodeIds = new Set(nodes.value.map(n => n.id));
  const filteredNodes = newNodes.filter(node => !existingNodeIds.has(node.id));
  const filteredEdges = newEdges.filter(edge => {
    const existingEdgeIds = new Set(edges.value.map(e => e.id));
    return !existingEdgeIds.has(edge.id);
  });
  
  // Add only new nodes/edges to current state
  if (filteredNodes.length > 0) {
    addNodes(filteredNodes);
  }
  if (filteredEdges.length > 0) {
    addEdges(filteredEdges);
  }
  
  // Mark this node's upstream as expanded
  expandedNodes.value[`${nodeId}_upstream`] = true;
  
  // Apply layout to all nodes and edges
  const layoutedData = await applyLayout();
  setNodes(layoutedData.nodes);
  setEdges(layoutedData.edges);
  
  await nextTick();
  isLayouting.value = false;
  
  // Smart viewport adjustment to show new upstream nodes
  await nextTick();
  fitView({ padding: 0.2, duration: 300 });
};

const onAddDownstream = async (nodeId: string) => {
  isLayouting.value = true;
  
  const { nodes: newNodes, edges: newEdges } = generateGraphForDownstream(
    nodeId,
    props.pipelineData
  );
  
  // Filter out nodes that already exist
  const existingNodeIds = new Set(nodes.value.map(n => n.id));
  const filteredNodes = newNodes.filter(node => !existingNodeIds.has(node.id));
  const filteredEdges = newEdges.filter(edge => {
    const existingEdgeIds = new Set(edges.value.map(e => e.id));
    return !existingEdgeIds.has(edge.id);
  });
  
  // Add only new nodes/edges to current state
  if (filteredNodes.length > 0) {
    addNodes(filteredNodes);
  }
  if (filteredEdges.length > 0) {
    addEdges(filteredEdges);
  }
  
  // Mark this node's downstream as expanded
  expandedNodes.value[`${nodeId}_downstream`] = true;
  
  // Apply layout to all nodes and edges
  const layoutedData = await applyLayout();
  setNodes(layoutedData.nodes);
  setEdges(layoutedData.edges);
  
  await nextTick();
  isLayouting.value = false;
  
  // Smart viewport adjustment to show new downstream nodes
  await nextTick();
  fitView({ padding: 0.2, duration: 300 });
};

/**
 * Filter handlers
 */
const resetFilterState = () => {
  filterType.value = "direct";
  expandAllUpstreams.value = false;
  expandAllDownstreams.value = false;
};

/**
 * UI action handlers
 */

const handleReset = async () => {
  resetFilterState();
  expandedNodes.value = {};
  showPipelineView.value = false;
  showColumnView.value = false;
  await updateGraph();
};

/**
 * View switching
 */
const handleAssetView = (emittedData: {
  assetId?: string;
  assetDataset?: AssetDataset | null;
  pipelineData: any;
  LineageError: string | null;
  filterState?: { filterType: "direct" | "all"; expandAllUpstreams: boolean; expandAllDownstreams: boolean };
}) => {
  showPipelineView.value = false;
  showColumnView.value = false;
  
  // Apply filter state if provided
  if (emittedData.filterState) {
    filterType.value = emittedData.filterState.filterType;
    expandAllUpstreams.value = emittedData.filterState.expandAllUpstreams;
    expandAllDownstreams.value = emittedData.filterState.expandAllDownstreams;
    
    // Clear expanded nodes if switching to direct view
    if (emittedData.filterState.filterType === 'direct') {
      expandedNodes.value = {};
    }
  }
  
  nextTick(() => processProperties());
};

const handlePipelineView = async (data?: any) => {
  showPipelineView.value = true;
  showColumnView.value = false;
};

const handleColumnLevelLineage = async (data?: any) => {
  showColumnView.value = true;
  showPipelineView.value = false;
};

/**
 * Lifecycle hooks
 */
onMounted(() => {
  processProperties();
});

// Watch for filter changes to automatically update graph
watch(
  () => [filterType.value, expandAllUpstreams.value, expandAllDownstreams.value],
  () => {
    if (props.assetDataset && props.pipelineData && !showPipelineView.value && !showColumnView.value) {
      updateGraph();
    }
  },
  { immediate: false }
);

// Watch for props changes
watch(
  () => [props.assetDataset, props.pipelineData],
  ([newAssetDataset, newPipelineData]) => {
    if (newAssetDataset && newPipelineData && !showPipelineView.value && !showColumnView.value) {
      processProperties();
    }
  },
  { immediate: false }
);
</script>

<style>
@import "@vue-flow/core/dist/style.css";
@import "@vue-flow/core/dist/theme-default.css";

.vue-flow__node.faded,
.vue-flow__edge.faded {
  opacity: 0.3;
  transition: opacity 0.2s ease-in-out;
}

.flow {
  @apply relative flex h-screen w-full p-0 !important;
}

.vue-flow__controls {
  bottom: 1rem !important;
  left: 1rem !important;
  top: auto !important;
  right: auto !important;
  background-color: transparent !important;
  display: flex !important;
  flex-direction: row !important;
  gap: 0.3rem;
}

.vue-flow__controls-button {
  @apply flex justify-center items-center p-0 border-solid border-notificationCenter-border bg-transparent rounded-md w-6 h-6 cursor-pointer hover:bg-editor-bg  !important;
}

.vue-flow__controls-button svg {
  @apply fill-current text-editor-fg !important;
}

.custom-controls .vue-flow__controls-button:hover {
  background-color: #444 !important;
}

.error-message {
  flex-direction: column;
}

vscode-checkbox {
  @apply text-xs;
}

.loading-overlay {
  @apply absolute top-0 left-0 z-10 flex items-center justify-center w-full h-full bg-editor-bg;
}

.error-message {
  @apply flex items-center justify-center w-full h-full bg-editor-bg;
}
</style>