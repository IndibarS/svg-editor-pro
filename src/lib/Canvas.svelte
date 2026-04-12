<script>
    import { modelStore } from "../store.js";

    export let tree;
    export let activeNodeId;

    let canvasParent;

    // Zoom / Pan state
    let scale = 1;
    let panX = 40; // Default off rulers
    let panY = 40;

    let draggingCanvas = false;
    let scrubbingZoom = false;
    let rDragData = { active: false, mouseX: 0, mouseY: 0 };
    let startPanX = 0;
    let startPanY = 0;
    let startMouseX = 0;
    let startMouseY = 0;
    let startScale = 1;
    let canvasWidth = 800;
    let canvasHeight = 600;

    // Grid toggle
    let gridEnabled = true;

    // Reactives
    $: viewBoxAttr = tree?.attributes?.viewBox || "0 0 600 600";
    $: [vbX, vbY, vbW, vbH] = viewBoxAttr.split(" ").map(Number);
    $: svgString = modelStore.toSvgString(tree);

    // Active Node search explicitly handling AST in template
    $: findNode = (id, root = tree) => {
        if (root.id === id) return root;
        for (let child of root.children || []) {
            let res = findNode(id, child);
            if (res) return res;
        }
        return null;
    };
    $: activeNode = activeNodeId ? findNode(activeNodeId) : null;

    // Reactive Resize Management
    $: if (canvasParent) {
        const rect = canvasParent.getBoundingClientRect();
        canvasWidth = rect.width;
        canvasHeight = rect.height;
    }

    // Point Dragging State
    let draggingPoint = null;

    // Attribute Dragging State (Circles, etc)
    let draggingAttr = null;

    // Viewbox Scale Ruler Dragging
    let draggingVb = null;

    // Hover Tracking State
    let svgMouseX = 0;
    let svgMouseY = 0;

    // Resolve the effective control point for Q/T chains
    function resolveCP_Q(commands, index) {
        const cmd = commands[index];
        if (cmd.type === "Q") return { x: cmd.x1, y: cmd.y1 };
        if (cmd.type === "T" && index > 0) {
            const prevCP = resolveCP_Q(commands, index - 1);
            const prev = commands[index - 1];
            return { x: 2 * prev.x - prevCP.x, y: 2 * prev.y - prevCP.y };
        }
        return { x: cmd.x ?? 0, y: cmd.y ?? 0 };
    }

    // S always stores x2,y2 explicitly — just return it directly
    function resolveCP_S(commands, index) {
        const cmd = commands[index];
        if (cmd.type === "C" || cmd.type === "S")
            return { x: cmd.x2, y: cmd.y2 };
        return { x: cmd.x ?? 0, y: cmd.y ?? 0 };
    }

    // Walk back T chain to find root Q and compute needed x1/y1 for a given drag target
    function findReflectTarget_Q(commands, fromIndex, targetX, targetY) {
        let neededX = 2 * commands[fromIndex - 1].x - targetX;
        let neededY = 2 * commands[fromIndex - 1].y - targetY;
        let idx = fromIndex - 1;
        while (idx >= 0) {
            if (commands[idx].type === "Q")
                return {
                    rootIndex: idx,
                    key: "x1",
                    keyY: "y1",
                    x: neededX,
                    y: neededY,
                };
            if (commands[idx].type === "T" && idx > 0) {
                neededX = 2 * commands[idx - 1].x - neededX;
                neededY = 2 * commands[idx - 1].y - neededY;
                idx--;
            } else break;
        }
        return null;
    }

    // S reflection only depends on the immediately previous C/S's x2,y2 — no chain needed
    function findReflectTarget_S(commands, fromIndex, targetX, targetY) {
        const prevIdx = fromIndex - 1;
        if (prevIdx < 0) return null;
        const prev = commands[prevIdx];
        if (prev.type === "C" || prev.type === "S") {
            return {
                rootIndex: prevIdx,
                key: "x2",
                keyY: "y2",
                x: 2 * prev.x - targetX,
                y: 2 * prev.y - targetY,
            };
        }
        return null;
    }

    const getLastPos = (commands, index) => {
        let x = 0;
        let y = 0;
        for (let j = 0; j < index; j++) {
            const cmd = commands[j];
            if (cmd.x !== undefined) x = cmd.x;
            if (cmd.y !== undefined) y = cmd.y;
        }
        return { x, y };
    };

    function zoomTo(newScale, centerScreenX, centerScreenY) {
        // Essential safety floor to avoid division by zero or negative scale
        newScale = Math.max(0.000001, newScale);
        
        if (centerScreenX === undefined || centerScreenY === undefined) {
            const rect = canvasParent.getBoundingClientRect();
            // Default center of workspace (accounting for 20px rulers)
            centerScreenX = (rect.width - 20) / 2;
            centerScreenY = (rect.height - 20) / 2;
        }

        panX = centerScreenX - (centerScreenX - panX) * (newScale / scale);
        panY = centerScreenY - (centerScreenY - panY) * (newScale / scale);
        scale = newScale;
    }

    function handleWheel(e) {
        e.preventDefault();

        const rect = canvasParent.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - 20;
        const mouseY = e.clientY - rect.top - 20;

        if (e.ctrlKey || e.metaKey) {
            // Pinch-to-zoom (touchpad) or Ctrl+Wheel (mouse)
            // Most browsers represent touchpad pinch as wheel + ctrlKey
            const zoomAmount = e.deltaY * -0.002 * scale;
            zoomTo(scale + zoomAmount, mouseX, mouseY);
            return;
        }

        if (e.shiftKey) {
            // Shift + Wheel = Horizontal pan
            panX -= e.deltaY;
            return;
        }

        // Heuristic to distinguish Mouse Wheel from Touchpad Pan
        // Touchpads usually send events with non-zero deltaX OR small/non-integer deltaY.
        // Standard mice usually send large, discrete integer deltaY (like 100 or 120).
        const hasDeltaX = Math.abs(e.deltaX) > 0;
        const isDiscrete = Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 10;

        if (hasDeltaX || !isDiscrete) {
            // Likely a touchpad pan or horizontal wheel
            panX -= e.deltaX;
            panY -= e.deltaY;
        } else {
            // Likely a vertical mouse wheel -> Zoom
            const direction = -Math.sign(e.deltaY);
            // Multiplicative zoom for more consistent feel at high/low zoom levels
            const factor = 1 + direction * 0.1;
            zoomTo(scale * factor, mouseX, mouseY);
        }
    }

    function handleMouseDown(e) {
        // middle click or alt/space left click pans
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            draggingCanvas = true;
            document.body.style.cursor = "grabbing";
            startPanX = panX;
            startPanY = panY;
            startMouseX = e.clientX;
            startMouseY = e.clientY;
        }
    }

    function handleZoomScrub(e) {
        if (!scrubbingZoom) return;
        const dx = e.clientX - startMouseX;
        // Exponential scrubbing for infinite range feel
        // ~1% change per pixel at 100%, but scales with current zoom
        const sensitivity = 0.01;
        const newScale = startScale * Math.exp(dx * sensitivity);
        zoomTo(newScale);
    }

    function handleKeydown(e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                zoomTo(scale * 1.1);
            } else if (e.key === "-") {
                e.preventDefault();
                zoomTo(scale / 1.1);
            } else if (e.key === "0") {
                e.preventDefault();
                zoomTo(1);
            }
        }
    }

    function handleZoomScrubStart(e) {
        scrubbingZoom = true;
        startMouseX = e.clientX;
        startScale = scale;
        // Optional pointer lock
        if (e.target.requestPointerLock) e.target.requestPointerLock();
    }

    function handleMouseMove(e) {
        if (draggingCanvas) {
            panX = startPanX + (e.clientX - startMouseX);
            panY = startPanY + (e.clientY - startMouseY);
        } else if (scrubbingZoom) {
            let dx = 0;
            if (document.pointerLockElement) {
                dx = e.movementX;
                // Accumulate delta if pointer locked
                startScale += dx * 0.01;
                zoomTo(startScale);
            } else {
                dx = e.clientX - startMouseX;
                zoomTo(startScale + dx * 0.01);
            }
        } else if (draggingPoint) {
            // Inverse transform to find SVG coords
            const rect = canvasParent.getBoundingClientRect();
            const screenX = e.clientX - rect.left - 20;
            const screenY = e.clientY - rect.top - 20;
            // SVG cord = (screen - pan) / scale
            const svgX = Math.round((screenX - panX) / scale);
            const svgY = Math.round((screenY - panY) / scale);

            const { nodeId, index, key } = draggingPoint;
            if (key === "__reflect_x2" || key === "__reflect_x1") {
                const cmds = activeNode?.commands;
                if (key === "__reflect_x1") {
                    const target = findReflectTarget_Q(
                        cmds,
                        draggingPoint._fromIndex,
                        svgX,
                        svgY,
                    );
                    if (target) {
                        modelStore.updateCommand(
                            nodeId,
                            target.rootIndex,
                            target.key,
                            Math.round(target.x),
                        );
                        modelStore.updateCommand(
                            nodeId,
                            target.rootIndex,
                            target.keyY,
                            Math.round(target.y),
                        );
                    }
                } else {
                    const target = findReflectTarget_S(
                        cmds,
                        draggingPoint._fromIndex,
                        svgX,
                        svgY,
                    );
                    if (target) {
                        modelStore.updateCommand(
                            nodeId,
                            target.rootIndex,
                            target.key,
                            Math.round(target.x),
                        );
                        modelStore.updateCommand(
                            nodeId,
                            target.rootIndex,
                            target.keyY,
                            Math.round(target.y),
                        );
                    }
                }
            } else {
                const cmdType = activeNode?.commands?.[index]?.type;
                const val = key.includes("y") ? svgY : svgX;
                modelStore.updateCommand(nodeId, index, key, val);
                if (cmdType !== "H" && cmdType !== "V") {
                    let yKey = key.replace("x", "y");
                    modelStore.updateCommand(nodeId, index, yKey, svgY);
                }
            }
        } else if (draggingAttr) {
            const rect = canvasParent.getBoundingClientRect();
            const mx = Math.round((e.clientX - rect.left - 20 - panX) / scale);
            const my = Math.round((e.clientY - rect.top - 20 - panY) / scale);

            if (
                draggingAttr.keys.includes("width") &&
                draggingAttr.keys.includes("height")
            ) {
                let nw = Math.max(1, mx - draggingAttr.customData.x);
                let nh = Math.max(1, my - draggingAttr.customData.y);
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "width",
                    nw.toFixed(0),
                );
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "height",
                    nh.toFixed(0),
                );
                document.body.style.cursor = createResizeCursor(
                    (Math.atan2(nh, nw) * 180) / Math.PI,
                );
            } else if (
                draggingAttr.keys.includes("rx") &&
                draggingAttr.keys.includes("ry")
            ) {
                const cx = parseFloat(draggingAttr.customData.cx);
                const cy = parseFloat(draggingAttr.customData.cy);
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "rx",
                    Math.abs(mx - cx).toFixed(1),
                );
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "ry",
                    Math.abs(my - cy).toFixed(1),
                );
            } else if (draggingAttr.keys.includes("r")) {
                // Trigo circle computation
                const cx = parseFloat(draggingAttr.customData.cx);
                const cy = parseFloat(draggingAttr.customData.cy);
                const nr = Math.sqrt(
                    Math.pow(mx - cx, 2) + Math.pow(my - cy, 2),
                );

                rDragData = { active: true, mouseX: mx, mouseY: my };
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "r",
                    nr.toFixed(1),
                );
                document.body.style.cursor = createResizeCursor(
                    (Math.atan2(my - cy, mx - cx) * 180) / Math.PI,
                );
            } else if (
                draggingAttr.keys.includes("cx") &&
                draggingAttr.keys.includes("cy")
            ) {
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "cx",
                    String(mx),
                );
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "cy",
                    String(my),
                );
            } else if (
                draggingAttr.keys.includes("x") &&
                draggingAttr.keys.includes("y")
            ) {
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "x",
                    String(mx),
                );
                modelStore.updateAttribute(
                    draggingAttr.nodeId,
                    "y",
                    String(my),
                );
            }
        } else if (draggingVb) {
            const rect = canvasParent.getBoundingClientRect();
            const screenX = e.clientX - rect.left - 20;
            const screenY = e.clientY - rect.top - 20;
            const svgX = Math.round((screenX - panX) / scale);
            const svgY = Math.round((screenY - panY) / scale);

            let [vX, vY, vW, vH] = (tree?.attributes?.viewBox || "0 0 600 600")
                .split(" ")
                .map(Number);

            if (draggingVb === "minX") {
                const diff = svgX - vX;
                const newWidth = Math.max(1, vW - diff);
                vX = svgX;
                vW = newWidth;
            } else if (draggingVb === "width") {
                vW = Math.max(1, svgX - vX);
            } else if (draggingVb === "minY") {
                const diff = svgY - vY;
                const newHeight = Math.max(1, vH - diff);
                vY = svgY;
                vH = newHeight;
            } else if (draggingVb === "height") {
                vH = Math.max(1, svgY - vY);
            }
            modelStore.updateAttribute(
                tree.id,
                "viewBox",
                `${vX} ${vY} ${vW} ${vH}`,
            );
        }

        // Always track cursor for locators
        const rect = canvasParent.getBoundingClientRect();
        svgMouseX = Math.round((e.clientX - rect.left - 20 - panX) / scale);
        svgMouseY = Math.round((e.clientY - rect.top - 20 - panY) / scale);
    }

    function handleMouseUp() {
        draggingCanvas = false;
        if (scrubbingZoom) {
            scrubbingZoom = false;
            if (document.exitPointerLock) document.exitPointerLock();
        }
        draggingPoint = null;
        draggingAttr = null;
        draggingVb = null;
        rDragData = { active: false, mouseX: 0, mouseY: 0 };
        document.body.style.cursor = "";
    }

    function handleCanvasClick(e) {
        if (draggingCanvas || draggingPoint || draggingAttr || draggingVb)
            return;

        if (e.target.closest("[data-id]")) {
            const id = e.target.closest("[data-id]").getAttribute("data-id");
            modelStore.setActive(id);
        } else if (
            e.target.closest(".p-anchor") ||
            e.target.closest(".p-control") ||
            e.target.closest(".helper-line")
        ) {
            return;
        } else {
            modelStore.setActive(null);
        }
    }

    function createResizeCursor(angleDeg) {
        const shapes = `
            <line x1="8" y1="16" x2="24" y2="16" stroke-linecap="round"/>
            <polygon points="9,14 5,16 9,18" stroke-linejoin="round"/>
            <polygon points="23,14 27,16 23,18" stroke-linejoin="round"/>
        `;
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
                <g transform="rotate(${angleDeg}, 16, 16)">
                    <g stroke="white" fill="white" stroke-width="4">${shapes}</g>
                    <g stroke="black" fill="black" stroke-width="2">${shapes}</g>
                </g>
            </svg>`;
        return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " "))}') 16 16, auto`;
    }

    function createMoveCursor() {
        const shapes = `
            <line x1="16" y1="8" x2="16" y2="24" stroke-linecap="round"/>
            <line x1="8" y1="16" x2="24" y2="16" stroke-linecap="round"/>
            <polygon points="16,5 18,9 14,9" stroke-linejoin="round"/>
            <polygon points="16,27 18,23 14,23" stroke-linejoin="round"/>
            <polygon points="5,16 9,14 9,18" stroke-linejoin="round"/>
            <polygon points="27,16 23,14 23,18" stroke-linejoin="round"/>
        `;
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
                <g stroke="white" fill="white" stroke-width="4">${shapes}</g>
                <g stroke="black" fill="black" stroke-width="2">${shapes}</g>
            </svg>`;
        return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " "))}') 16 16, move`;
    }

    function startAttributeDrag(nodeId, keys, e, customData = {}) {
        e.stopPropagation();
        draggingAttr = { nodeId, keys, customData };
        document.body.style.cursor = customData.cursorURL || createMoveCursor();
    }

    function startPointDrag(nodeId, index, key, e) {
        e.stopPropagation();
        draggingPoint = { nodeId, index, key };
        document.body.style.cursor = createMoveCursor();
    }

    function startVbDrag(type, e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        draggingVb = type;
        document.body.style.cursor = (type === "minX" || type === "width") ? "ew-resize" : "ns-resize";
    }

    // Adaptive Ruler Logic
    const getStep = (s) => {
        const target = 100 / s;
        const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
        const ratio = target / magnitude;
        if (ratio >= 7) return 10 * magnitude;
        if (ratio >= 3.5) return 5 * magnitude;
        if (ratio >= 1.5) return 2 * magnitude;
        return 1 * magnitude;
    };

    const generateTicks = (step, pan, size, s) => {
        if (!step || !s || step <= 0) return [];
        const start = Math.floor((-pan / s) / step) * step;
        const end = Math.ceil(((size - pan) / s) / step) * step;
        const ticks = [];
        // Safety break for extreme densities
        const maxTicks = 1000;
        let count = 0;
        for (let v = start; v <= end && count < maxTicks; v += step) {
            ticks.push(Math.round(v * 1000) / 1000); // Precision fix
            count++;
        }
        return ticks;
    };

    $: majorStep = getStep(scale);
    $: minorStep = majorStep / 5;

    $: xTicks = generateTicks(majorStep, panX, canvasWidth, scale);
    $: xMinorTicks = generateTicks(minorStep, panX, canvasWidth, scale);
    $: yTicks = generateTicks(majorStep, panY, canvasHeight, scale);
    $: yMinorTicks = generateTicks(minorStep, panY, canvasHeight, scale);

    // Checkerboard inverse physical absolute anchoring mapping
    $: bgSize = 20 / scale;
    $: bpX = -(panX / scale) - (vbX || 0);
    $: bpY = -(panY / scale) - (vbY || 0);
</script>

<svelte:window on:keydown={handleKeydown} />

<div
    class="canvas-parent"
    bind:this={canvasParent}
    on:wheel|nonpassive={handleWheel}
    on:mousedown={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:mouseup={handleMouseUp}
    on:mouseleave={handleMouseUp}
    role="presentation"
>
    <!-- Rulers -->
    <div class="ruler ruler-top">
        <div class="ruler-bg"></div>
        <div
            class="ruler-markers"
            role="presentation"
        >
            {#each xMinorTicks as tick}
                <div class="tick minor" style="left: {tick * scale + panX}px"></div>
            {/each}
            {#each xTicks as tick}
                <div class="tick major" style="left: {tick * scale + panX}px">
                    <span>{tick}</span>
                </div>
            {/each}
            <!-- ViewBox Highlighted Region -->
            <div
                class="vb-region-x"
                style="left: {vbX * scale + panX}px; width: {vbW * scale}px"
            ></div>

            <!-- Mouse Tracker -->
            <div class="tracker-tick" style="left: {svgMouseX * scale + panX}px">
                <div class="tracker-line"></div>
                <div
                    class="pointer-head"
                    style="transform: translateX(-50%)"
                ></div>
            </div>

            <!-- Draggable ViewBox range handles -->
            <div
                class="vb-handle-x min"
                role="slider"
                tabindex="0"
                aria-label="ViewBox X min"
                aria-valuenow={vbX}
                style="left: {vbX * scale + panX}px"
                on:mousedown|stopPropagation={(e) => startVbDrag("minX", e)}
                on:keydown={() => {}}
            >
                <div
                    class="pointer-head"
                    style="transform: translateX(-50%)"
                ></div>
            </div>
            <div
                class="vb-handle-x size"
                role="slider"
                tabindex="0"
                aria-label="ViewBox width"
                aria-valuenow={vbW}
                style="left: {(vbX + vbW) * scale + panX}px"
                on:mousedown|stopPropagation={(e) => startVbDrag("width", e)}
                on:keydown={() => {}}
            >
                <div
                    class="pointer-head"
                    style="transform: translateX(-50%)"
                ></div>
            </div>
        </div>
    </div>

    <div class="ruler ruler-left">
        <div class="ruler-bg"></div>
        <div
            class="ruler-markers"
            role="presentation"
        >
            {#each yMinorTicks as tick}
                <div class="tick minor" style="top: {tick * scale + panY}px"></div>
            {/each}
            {#each yTicks as tick}
                <div class="tick major" style="top: {tick * scale + panY}px">
                    <span>{tick}</span>
                </div>
            {/each}
            <!-- ViewBox Highlighted Region -->
            <div
                class="vb-region-y"
                style="top: {vbY * scale + panY}px; height: {vbH * scale}px"
            ></div>

            <!-- Mouse Tracker -->
            <div class="tracker-tick y-tracker" style="top: {svgMouseY * scale + panY}px">
                <div class="tracker-line"></div>
                <div
                    class="pointer-head"
                    style="transform: translateY(-50%) rotate(-90deg)"
                ></div>
            </div>

            <!-- Draggable ViewBox range handles -->
            <div
                class="vb-handle-y min"
                role="slider"
                tabindex="0"
                aria-label="ViewBox Y min"
                aria-valuenow={vbY}
                style="top: {vbY * scale + panY}px"
                on:mousedown|stopPropagation={(e) => startVbDrag("minY", e)}
                on:keydown={() => {}}
            >
                <div
                    class="pointer-head"
                    style="transform: translateY(-50%) rotate(-90deg)"
                ></div>
            </div>
            <div
                class="vb-handle-y size"
                role="slider"
                tabindex="0"
                aria-label="ViewBox height"
                aria-valuenow={vbH}
                style="top: {(vbY + vbH) * scale + panY}px"
                on:mousedown|stopPropagation={(e) => startVbDrag("height", e)}
                on:keydown={() => {}}
            >
                <div
                    class="pointer-head"
                    style="transform: translateY(-50%) rotate(-90deg)"
                ></div>
            </div>
        </div>
    </div>

    <!-- Corner block -->
    <div class="ruler-corner"></div>

    <!-- Viewer -->
    <div 
        class="workspace-area"
        role="button"
        tabindex="0"
        aria-label="SVG Editor Workspace"
        on:click={handleCanvasClick}
        on:keydown={(e) => {}}
    >
        <!-- Adaptive Grid Overlay (Locked to viewport size, pattern shifts with pan) -->
        {#if gridEnabled}
            <div 
                class="grid-overlay" 
                style="
                    background-size: {majorStep * scale}px {majorStep * scale}px; 
                    background-position: {panX}px {panY}px
                "
            ></div>
        {/if}

        <div
            class="svg-transformer"
            style="transform: translate({panX}px, {panY}px) scale({scale}) translate({vbX ||
                0}px, {vbY || 0}px); width: {vbW}px; height: {vbH}px;"
        >
            <!-- Background checkerboard inverse matrix rendering -->
            <div
                class="checkerboard"
                style="
                width: {vbW}px; height: {vbH}px;
                background-size: {bgSize}px {bgSize}px;
                background-position: {bpX}px {bpY}px, {bpX}px {bpY +
                    bgSize / 2}px, {bpX + bgSize / 2}px {bpY -
                    bgSize / 2}px, {bpX - bgSize / 2}px {bpY}px;
            "
            ></div>

            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="svg-render"
                style="width: {vbW}px; height: {vbH}px;"
            >
                {@html svgString.replace(
                    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n',
                    "",
                )}
            </div>

            <!-- Darkening Shroud (Outer region) -->
            <svg class="out-of-bounds-shroud" width="100%" height="100%" style="position: absolute; top: 0; left: 0; overflow: visible; z-index: 10; pointer-events: none;">
                <path 
                    d="M -10000 -10000 h 20000 v 20000 h -20000 z M 0 0 v {vbH} h {vbW} v {-vbH} z" 
                    fill="rgba(0, 0, 0, 0.85)" 
                    fill-rule="evenodd"
                    pointer-events="none"
                />
            </svg>

            <!-- Interaction Overlay -->
            {#if activeNode?.type === "path" && !modelStore.isEffectivelyHidden($modelStore.tree, activeNode.id)}
                <svg
                    class="overlay"
                    viewBox="{vbX - 10000} {vbY - 10000} 20000 20000"
                    style="position: absolute; top: -10000px; left: -10000px; width: 20000px; height: 20000px; z-index: 20; pointer-events: none;"
                >
                    {#each activeNode.commands as cmd, i}
                        {#if cmd.type === "M" || cmd.type === "L"}
                            <circle
                                cx={cmd.x}
                                cy={cmd.y}
                                r={6 / scale}
                                stroke-width={2 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Anchor Point"
                                class="p-anchor"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x", e)}
                                on:keydown={() => {}}
                            />
                        {/if}
                        {#if cmd.type === "H"}
                            {@const prevY =
                                i > 0
                                    ? (activeNode.commands[i - 1].y ??
                                      activeNode.commands[i - 1].cy ??
                                      0)
                                    : 0}
                            <circle
                                cx={cmd.x}
                                cy={prevY}
                                r={6 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Horizontal Anchor"
                                class="p-anchor"
                                style="cursor: ew-resize;"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x", e)}
                                on:keydown={() => {}}
                            />
                        {/if}
                        {#if cmd.type === "V"}
                            {@const prevX =
                                i > 0
                                    ? (activeNode.commands[i - 1].x ??
                                      activeNode.commands[i - 1].cx ??
                                      0)
                                    : 0}
                            <circle
                                cx={prevX}
                                cy={cmd.y}
                                r={6 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Vertical Anchor"
                                class="p-anchor"
                                style="cursor: ns-resize;"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "y", e)}
                                on:keydown={() => {}}
                            />
                        {/if}
                        {#if cmd.type === "C"}
                            {@const prev = getLastPos(activeNode.commands, i)}
                            <line
                                x1={prev.x}
                                y1={prev.y}
                                x2={cmd.x1}
                                y2={cmd.y1}
                                stroke-width={1.5 / scale}
                                class="helper-line-handle"
                            />
                            <!-- Handle from second control point back to endpoint -->
                            <line
                                x1={cmd.x2}
                                y1={cmd.y2}
                                x2={cmd.x}
                                y2={cmd.y}
                                stroke-width={1.5 / scale}
                                class="helper-line-handle"
                            />

                            <circle
                                cx={cmd.x1}
                                cy={cmd.y1}
                                r={5 / scale}
                                stroke-width={2 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Control Point 1"
                                class="p-control"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x1", e)}
                                on:keydown={() => {}}
                            />
                            <circle
                                cx={cmd.x2}
                                cy={cmd.y2}
                                r={5 / scale}
                                stroke-width={2 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Control Point 2"
                                class="p-control"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x2", e)}
                                on:keydown={() => {}}
                            />
                            <circle
                                cx={cmd.x}
                                cy={cmd.y}
                                r={6 / scale}
                                stroke-width={2 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Curve Anchor"
                                class="p-anchor"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x", e)}
                                on:keydown={() => {}}
                            />
                        {/if}
                        {#if cmd.type === "Q"}
                            {@const prev = getLastPos(activeNode.commands, i)}
                            <line
                                x1={prev.x}
                                y1={prev.y}
                                x2={cmd.x1}
                                y2={cmd.y1}
                                stroke-width={1.5 / scale}
                                class="helper-line-handle"
                            />
                            <line
                                x1={cmd.x1}
                                y1={cmd.y1}
                                x2={cmd.x}
                                y2={cmd.y}
                                stroke-width={1.5 / scale}
                                class="helper-line-handle"
                            />

                            <circle
                                cx={cmd.x1}
                                cy={cmd.y1}
                                r={5 / scale}
                                stroke-width={2 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Quadratic Control Point"
                                class="p-control"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x1", e)}
                                on:keydown={() => {}}
                            />
                            <circle
                                cx={cmd.x}
                                cy={cmd.y}
                                r={6 / scale}
                                stroke-width={2 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Quadratic Anchor"
                                class="p-anchor"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x", e)}
                                on:keydown={() => {}}
                            />
                        {/if}
                        {#if cmd.type === "A"}
                            <circle
                                cx={cmd.x}
                                cy={cmd.y}
                                r={6 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Arc Anchor"
                                class="p-anchor"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x", e)}
                                on:keydown={() => {}}
                            />
                        {/if}
                        {#if cmd.type === "S"}
                            {@const prev = getLastPos(activeNode.commands, i)}
                            {@const prevCmd =
                                i > 0 ? activeNode.commands[i - 1] : null}
                            {@const hasReflect =
                                prevCmd &&
                                (prevCmd.type === "C" || prevCmd.type === "S")}
                            {@const cp = hasReflect
                                ? resolveCP_S(activeNode.commands, i - 1)
                                : { x: prev.x, y: prev.y }}
                            {@const refX = 2 * prev.x - cp.x}
                            {@const refY = 2 * prev.y - cp.y}
                            <line
                                x1={prev.x}
                                y1={prev.y}
                                x2={refX}
                                y2={refY}
                                stroke-width={1.5 / scale}
                                class="helper-line-reflected"
                            />
                            {#if hasReflect}
                                <circle
                                    cx={refX}
                                    cy={refY}
                                    r={5 / scale}
                                    stroke-width={2 / scale}
                                    role="button"
                                    tabindex="0"
                                    aria-label="Reflected Smooth Control Point"
                                    class="p-control"
                                    style="cursor: {createMoveCursor()};"
                                    on:mousedown={(e) => {
                                        startPointDrag(
                                            activeNode.id,
                                            i,
                                            "x2",
                                            e,
                                        );
                                        draggingPoint = {
                                            nodeId: activeNode.id,
                                            index: i,
                                            key: "__reflect_x2",
                                            _fromIndex: i,
                                            _prevX: prev.x,
                                            _prevY: prev.y,
                                        };
                                    }}
                                    on:keydown={() => {}}
                                />
                            {/if}
                            <!-- Solid handle to x2,y2 -->
                            <line
                                x1={cmd.x2}
                                y1={cmd.y2}
                                x2={cmd.x}
                                y2={cmd.y}
                                stroke-width={1.5 / scale}
                                class="helper-line-handle"
                            />
                            <circle
                                cx={cmd.x2}
                                cy={cmd.y2}
                                r={5 / scale}
                                stroke-width={2 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Smooth Control Point"
                                class="p-control"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x2", e)}
                                on:keydown={() => {}}
                            />
                            <circle
                                cx={cmd.x}
                                cy={cmd.y}
                                r={6 / scale}
                                stroke-width={2 / scale}
                                role="button"
                                tabindex="0"
                                aria-label="Smooth Anchor"
                                class="p-anchor"
                                style="cursor: {createMoveCursor()};"
                                on:mousedown={(e) =>
                                    startPointDrag(activeNode.id, i, "x", e)}
                                on:keydown={() => {}}
                            />
                        {/if}
                        {#if cmd.type === "T"}
                            {@const prev = getLastPos(activeNode.commands, i)}
                            {@const prevCmd =
                                i > 0 ? activeNode.commands[i - 1] : null}
                            {@const hasReflect =
                                prevCmd &&
                                (prevCmd.type === "Q" || prevCmd.type === "T")}
                            {@const cp = hasReflect
                                ? resolveCP_Q(activeNode.commands, i - 1)
                                : { x: prev.x, y: prev.y }}
                            {@const refX = 2 * prev.x - cp.x}
                            {@const refY = 2 * prev.y - cp.y}
                            <!-- Lines first (below circles) -->
                            <line
                                x1={prev.x}
                                y1={prev.y}
                                x2={refX}
                                y2={refY}
                                stroke-width={1.5 / scale}
                                class="helper-line-reflected"
                            />
                            <line
                                x1={refX}
                                y1={refY}
                                x2={cmd.x}
                                y2={cmd.y}
                                stroke-width={1.5 / scale}
                                class="helper-line-reflected"
                            />
                            <!-- Circles on top -->
                            {#if hasReflect}
                                <circle
                                    cx={refX}
                                    cy={refY}
                                    r={5 / scale}
                                    stroke-width={2 / scale}
                                    role="button"
                                    tabindex="0"
                                    aria-label="Reflected Quadratic Control Point"
                                    class="p-control"
                                    style="cursor: {createMoveCursor()};"
                                    on:mousedown={(e) => {
                                        startPointDrag(
                                            activeNode.id,
                                            i,
                                            "x",
                                            e,
                                        );
                                        draggingPoint = {
                                            nodeId: activeNode.id,
                                            index: i,
                                            key: "__reflect_x1",
                                            _fromIndex: i,
                                            _prevX: prev.x,
                                            _prevY: prev.y,
                                        };
                                    }}
                                    on:keydown={() => {}}
                                />
                            {/if}
                    <circle
                        cx={cmd.x}
                        cy={cmd.y}
                        r={6 / scale}
                        stroke-width={2 / scale}
                        role="button"
                        tabindex="0"
                        aria-label="Smooth Quadratic Anchor"
                        class="p-anchor"
                        style="cursor: {createMoveCursor()};"
                        on:mousedown={(e) =>
                            startPointDrag(activeNode.id, i, "x", e)}
                        on:keydown={() => {}}
                    />
                        {/if}
                    {/each}

                    <path
                        d={modelStore.toPathData(activeNode)}
                        fill="none"
                        stroke="rgba(0, 240, 255, 0.4)"
                        stroke-width={1.5 / scale}
                    />
                </svg>
            {:else if activeNode?.type === "circle" && !modelStore.isEffectivelyHidden($modelStore.tree, activeNode.id)}
                {@const cx = parseFloat(activeNode.attributes.cx) || 0}
                {@const cy = parseFloat(activeNode.attributes.cy) || 0}
                {@const r = parseFloat(activeNode.attributes.r) || 0}
                {@const angle = rDragData.active
                    ? Math.atan2(rDragData.mouseY - cy, rDragData.mouseX - cx)
                    : Math.atan2(svgMouseY - cy, svgMouseX - cx)}
                {@const rX = cx + r * Math.cos(angle)}
                {@const rY = cy + r * Math.sin(angle)}
                {@const circAngle = (angle * 180) / Math.PI}
                <svg
                    class="overlay"
                    viewBox="{vbX - 10000} {vbY - 10000} 20000 20000"
                    style="position: absolute; top: -10000px; left: -10000px; width: 20000px; height: 20000px; z-index: 20; pointer-events: none;"
                >
                    <!-- Outline helper -->
                    <circle
                        {cx}
                        {cy}
                        {r}
                        fill="none"
                        stroke="rgba(0, 240, 255, 0.4)"
                        stroke-width={1.5 / scale}
                    />
                    <!-- Central orientation visual guide -->
                    <line x1={cx} y1={cy} x2={rX} y2={rY} class="helper-line" stroke-width={1 / scale} />

                    <circle
                        {cx}
                        {cy}
                        r={5 / scale}
                        stroke-width={2 / scale}
                        role="button"
                        tabindex="0"
                        aria-label="Circle Center"
                        class="p-control"
                        style="cursor: {createMoveCursor()};"
                        on:mousedown={(e) =>
                            startAttributeDrag(activeNode.id, ["cx", "cy"], e)}
                        on:keydown={() => {}}
                    />
                    <circle
                        cx={rX}
                        cy={rY}
                        r={5 / scale}
                        stroke-width={2 / scale}
                        role="button"
                        tabindex="0"
                        aria-label="Circle Radius"
                        class="p-control"
                        style="cursor: {createResizeCursor(circAngle)};"
                        on:mousedown={(e) =>
                            startAttributeDrag(activeNode.id, ["r"], e, {
                                cx,
                                cy,
                                cursorURL: createResizeCursor(circAngle),
                            })}
                        on:keydown={() => {}}
                    />
                </svg>
            {:else if activeNode?.type === "ellipse" && !modelStore.isEffectivelyHidden($modelStore.tree, activeNode.id)}
                {@const cx = parseFloat(activeNode.attributes.cx) || 0}
                {@const cy = parseFloat(activeNode.attributes.cy) || 0}
                {@const rx = parseFloat(activeNode.attributes.rx) || 0}
                {@const ry = parseFloat(activeNode.attributes.ry) || 0}
                {@const ellipseAngle = (Math.atan2(ry, rx) * 180) / Math.PI}
                <svg
                    class="overlay"
                    viewBox="{vbX - 10000} {vbY - 10000} 20000 20000"
                    style="position: absolute; top: -10000px; left: -10000px; width: 20000px; height: 20000px; z-index: 20; pointer-events: none;"
                >
                    <!-- Outline helper -->
                    <ellipse
                        {cx}
                        {cy}
                        {rx}
                        {ry}
                        fill="none"
                        stroke="rgba(0, 240, 255, 0.4)"
                        stroke-width={1.5 / scale}
                    />
                    <circle
                        {cx}
                        {cy}
                        r={6 / scale}
                        stroke-width={2 / scale}
                        role="button"
                        tabindex="0"
                        aria-label="Ellipse Center"
                        class="p-anchor"
                        style="cursor: {createMoveCursor()};"
                        on:mousedown={(e) =>
                            startAttributeDrag(activeNode.id, ["cx", "cy"], e)}
                        on:keydown={() => {}}
                    />
                    <circle
                        cx={cx + rx}
                        cy={cy + ry}
                        r={5 / scale}
                        stroke-width={2 / scale}
                        role="button"
                        tabindex="0"
                        aria-label="Ellipse Radius"
                        class="p-control"
                        style="cursor: {createResizeCursor(ellipseAngle)};"
                        on:mousedown={(e) =>
                            startAttributeDrag(activeNode.id, ["rx", "ry"], e, {
                                cx,
                                cy,
                                cursorURL: createResizeCursor(ellipseAngle),
                            })}
                        on:keydown={() => {}}
                    />
                </svg>
            {:else if activeNode?.type === "rect" && !modelStore.isEffectivelyHidden($modelStore.tree, activeNode.id)}
                {@const rx = parseFloat(activeNode.attributes.x) || 0}
                {@const ry = parseFloat(activeNode.attributes.y) || 0}
                {@const rw = parseFloat(activeNode.attributes.width) || 0}
                {@const rh = parseFloat(activeNode.attributes.height) || 0}
                {@const rectAngle = (Math.atan2(rh, rw) * 180) / Math.PI}
                <svg
                    class="overlay"
                    viewBox="{vbX - 10000} {vbY - 10000} 20000 20000"
                    style="position: absolute; top: -10000px; left: -10000px; width: 20000px; height: 20000px; z-index: 20; pointer-events: none;"
                >
                    <!-- Outline helper -->
                    <rect
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        fill="none"
                        stroke="rgba(0, 240, 255, 0.4)"
                        stroke-width={1.5 / scale}
                    />
                    <circle
                        cx={rx}
                        cy={ry}
                        r={6 / scale}
                        stroke-width={2 / scale}
                        role="button"
                        tabindex="0"
                        aria-label="Rectangle Origin"
                        class="p-anchor"
                        style="cursor: {createMoveCursor()};"
                        on:mousedown={(e) =>
                            startAttributeDrag(activeNode.id, ["x", "y"], e)}
                        on:keydown={() => {}}
                    />
                    <circle
                        cx={rx + rw}
                        cy={ry + rh}
                        r={5 / scale}
                        stroke-width={2 / scale}
                        role="button"
                        tabindex="0"
                        aria-label="Rectangle Size"
                        class="p-control"
                        style="cursor: {createResizeCursor(rectAngle)};"
                        on:mousedown={(e) =>
                            startAttributeDrag(
                                activeNode.id,
                                ["width", "height"],
                                e,
                                {
                                    x: rx,
                                    y: ry,
                                    cursorURL: createResizeCursor(rectAngle),
                                },
                            )}
                        on:keydown={() => {}}
                    />
                </svg>
            {/if}
        </div>
    </div>

    <!-- Zoom UI -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="zoom-controls" role="toolbar" tabindex="-1" aria-label="Zoom Controls" on:mousedown|stopPropagation>
        <button class="zoom-btn" on:click={() => zoomTo(scale - 0.2)}>-</button>
        <button 
            class="zoom-label" 
            style="cursor: ew-resize;"
            on:pointerdown={handleZoomScrubStart}
            on:click={() => { if(!scrubbingZoom) zoomTo(1); }}
        >
            {Math.round(scale * 100)}%
        </button>
        <button class="zoom-btn" on:click={() => zoomTo(scale + 0.2)}>+</button>
    </div>
</div>

<style>
    .canvas-parent {
        position: relative;
        width: 100%;
        height: 100%;
        background-color: #0d0d0d;
        overflow: hidden;
    }

    .ruler {
        position: absolute;
        background: #1e1e1e;
        z-index: 10;
        overflow: hidden;
        user-select: none;
    }

    .ruler-top {
        top: 0;
        left: 20px;
        right: 0;
        height: 20px;
        border-bottom: 1px solid #333;
    }

    .ruler-left {
        top: 20px;
        left: 0;
        bottom: 0;
        width: 20px;
        border-right: 1px solid #333;
    }

    .ruler-corner {
        position: absolute;
        top: 0;
        left: 0;
        width: 20px;
        height: 20px;
        background: #111;
        z-index: 11;
        border-right: 1px solid #333;
        border-bottom: 1px solid #333;
    }

    .ruler-markers {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        transform-origin: 0 0;
    }

    .vb-region-x {
        position: absolute;
        top: 10px;
        height: 10px;
        background: rgba(0, 240, 255, 0.1);
        z-index: 1;
        border-right: 1px solid rgba(0, 240, 255, 0.4);
        border-left: 1px solid rgba(0, 240, 255, 0.4);
    }

    .vb-region-y {
        position: absolute;
        left: 10px;
        width: 10px;
        background: rgba(0, 240, 255, 0.1);
        z-index: 1;
        border-top: 1px solid rgba(0, 240, 255, 0.4);
        border-bottom: 1px solid rgba(0, 240, 255, 0.4);
    }

    .tick {
        position: absolute;
        display: flex;
        z-index: 2;
        pointer-events: none;
    }

    .tick.minor {
        background: #444;
    }

    .tick.major {
        background: #666;
    }

    /* Top Ruler Ticks */
    .ruler-top .tick.major {
        top: 0;
        bottom: 0;
        width: 1px;
        align-items: flex-end;
    }
    .ruler-top .tick.minor {
        top: 22px;
        bottom: 0;
        width: 1px;
    }
    .ruler-top .tick span {
        font-size: 9px;
        color: #aaa;
        margin-left: 2px;
        margin-bottom: 8px;
        user-select: none;
    }

    /* Left Ruler Ticks */
    .ruler-left .tick.major {
        left: 0;
        right: 0;
        height: 1px;
        justify-content: flex-end;
        align-items: center;
    }
    .ruler-left .tick.minor {
        left: 22px;
        right: 0;
        height: 1px;
    }
    .ruler-left .tick span {
        font-size: 9px;
        color: #aaa;
        transform: rotate(-90deg);
        margin-right: -4px;
        user-select: none;
    }

    .tracker-tick {
        position: absolute;
        z-index: 5;
        pointer-events: none;
        color: #ff3366;
    }
    .ruler-top .tracker-tick {
        top: 0;
        bottom: 0;
        width: 1px;
    }
    .ruler-left .tracker-tick {
        left: 0;
        right: 0;
        height: 1px;
    }

    .tracker-line {
        position: absolute;
        background: currentColor;
        transform: translateX(-50%);
    }
    .ruler-top .tracker-line {
        top: 0;
        bottom: 8px;
        width: 1px;
        left: 0;
    }
    .ruler-left .tracker-line {
        left: 0;
        right: 8px;
        height: 1px;
        top: 0;
        transform: translateY(-50%);
    }

    .pointer-head {
        position: absolute;
        width: 10px;
        height: 8px;
        background: currentColor;
        clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
    }

    .ruler-top .tracker-tick .pointer-head {
        bottom: 0;
        left: 0;
        transform: rotate(180deg);
    }
    .ruler-left .tracker-tick .pointer-head {
        right: 0;
        top: 0;
        transform: rotate(-90deg);
    }
    .ruler-top .vb-handle-x .pointer-head {
        bottom: 0;
        left: 0;
        transform: rotate(180deg);
    }
    .ruler-left .vb-handle-y .pointer-head {
        right: 0;
        top: 0;
        transform: rotate(90deg);
    }

    /* Viewbox Handles */
    .vb-handle-x, .vb-handle-y {
        position: absolute;
        z-index: 15;
        outline: none;
    }
    .vb-handle-x {
        cursor: ew-resize;
        top: 0;
        height: 100%;
        width: 2px;
    }
    .vb-handle-y {
        cursor: ns-resize;
        left: 0;
        width: 100%;
        height: 2px;
    }
    /* Viewbox Handles Base */
    .vb-handle-y,
    .vb-handle-x {
        position: absolute;
        z-index: 15;
    }
    .vb-handle-x {
        width: 4px;
        height: 100%;
        cursor: ew-resize;
    }
    .vb-handle-y {
        height: 4px;
        width: 100%;
        cursor: ns-resize;
    }

    .vb-handle-y:hover .pointer-head,
    .vb-handle-x:hover .pointer-head {
        background: var(--neon-blue);
        box-shadow: 0 0 8px var(--neon-blue);
    }

    .workspace-area {
        position: absolute;
        top: 20px;
        left: 20px;
        right: 0;
        bottom: 0;
        overflow: hidden;
        background: #000;
    }

    .svg-transformer {
        position: absolute;
        transform-origin: 0 0;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
    }

    .checkerboard {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #1a1a1a;
        background-image: linear-gradient(45deg, #222 25%, transparent 25%),
            linear-gradient(-45deg, #222 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #222 75%),
            linear-gradient(-45deg, transparent 75%, #222 75%);
        z-index: 1;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .grid-overlay {
        position: absolute;
        top: 0; left: 0; bottom: 0; right: 0;
        pointer-events: none;
        background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
        z-index: 1;
    }

    .svg-render {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2;
    }

    .svg-render :global(svg) {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible !important;
    }

    .overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 20;
        pointer-events: none;
        overflow: visible !important;
    }

    .p-anchor {
        fill: #00f0ff;
        cursor: move;
        outline: none;
        pointer-events: auto;
    }
    .p-anchor:active {
        fill: white;
    }

    .p-control {
        fill: #000;
        stroke: #00f0ff;
        cursor: move;
        outline: none;
        pointer-events: auto;
    }
    .p-control:active {
        fill: #00f0ff;
    }

    /* Zoom Controls */
    .zoom-controls {
        position: absolute;
        bottom: 24px;
        right: 24px;
        display: flex;
        align-items: center;
        background: rgba(20, 20, 20, 0.8);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 4px;
        z-index: 100;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    .zoom-btn {
        background: transparent;
        border: none;
        color: #ccc;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s;
        outline: none;
    }
    .zoom-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--neon-blue);
    }
    .zoom-label {
        background: transparent;
        border: none;
        color: #aaa;
        font-size: 0.75rem;
        font-weight: bold;
        padding: 0 12px;
        min-width: 60px;
        text-align: center;
        cursor: pointer;
        font-family: 'JetBrains Mono', monospace;
        letter-spacing: 0.5px;
        outline: none;
    }
    .zoom-label:hover {
        color: #fff;
    }

    .helper-line {
        stroke: #888;
        stroke-dasharray: 4;
    }

    .helper-line-handle {
        stroke: #00f0ff;
    }

    .helper-line-reflected {
        stroke: #00f0ff;
        stroke-dasharray: 6 3;
    }
</style>
