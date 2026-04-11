<script>
    import { modelStore } from './store.js';
    import Sidebar from './lib/Sidebar.svelte';
    import Canvas from './lib/Canvas.svelte';

    let selectedElement = 'path';
    let sidebarWidth = 320;
    let resizing = false;

    function startResize(e) {
        e.preventDefault();
        resizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }

    function handleResizeMove(e) {
        if (!resizing) return;
        sidebarWidth = Math.max(200, Math.min(600, e.clientX));
    }

    function stopResize() {
        if (!resizing) return;
        resizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    function addElement() {
        // Safe access inside component scope for activeNodeId
        modelStore.addElement(selectedElement, $modelStore.activeNodeId);
    }

    // addCommand was moved inline to Sidebar.svelte
    
    function reset() {
        if(confirm("Discard all changes?")) {
            window.location.reload(); 
        }
    }
    
    function saveSVG() {
        const svgContent = modelStore.toSvgString($modelStore.tree, true);
        const blob = new Blob([svgContent], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "material-export.svg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function loadSVG(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            modelStore.loadFromString(ev.target.result);
        };
        reader.readAsText(file);
        e.target.value = '';
    }
</script>

<main class="material-app">
    <header class="app-bar elevation-4">
        <div class="logo">SVG Editor Pro</div>
        <div class="actions">
            <button class="btn btn-text" on:click={reset}>New</button>
            <label class="btn btn-text cur-pointer" style="margin-left: 8px;">
                Open File
                <input type="file" accept=".svg" on:change={loadSVG} style="display:none;" />
            </label>
            <button class="btn btn-contained" style="margin-left: 16px;" on:click={saveSVG}>Save to SVG</button>
        </div>
    </header>

    <div class="app-content" on:mousemove={handleResizeMove} on:mouseup={stopResize}>
        <!-- Sidebar Panel -->
        <aside class="side-panel elevation-2" style="width: {sidebarWidth}px;">


            <!-- AST Tree Explorer -->
            <div class="explorer">
                <Sidebar tree={$modelStore.tree} activeNodeId={$modelStore.activeNodeId} />
            </div>
        </aside>

        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="resize-handle" class:active={resizing} on:mousedown={startResize}></div>

        <!-- Canvas Area -->
        <div class="canvas-area">
            {#key $modelStore.tree.id} <!-- Force remount if fully reset -->
                <Canvas tree={$modelStore.tree} activeNodeId={$modelStore.activeNodeId} />
            {/key}
        </div>
    </div>
</main>

<style>
    .material-app {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
    }

    .app-bar {
        background-color: var(--surface);
        min-height: 64px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        z-index: 100;
    }

    .logo {
        font-size: 20px;
        font-weight: 500;
        letter-spacing: 0.15px;
    }

    .actions {
        display: flex;
        align-items: center;
    }

    .app-content {
        display: flex;
        flex: 1;
        overflow: hidden;
    }

    .side-panel {
        background-color: var(--surface);
        min-width: 200px;
        max-width: 600px;
        display: flex;
        flex-direction: column;
        z-index: 50;
        flex-shrink: 0;
    }

    .resize-handle {
        width: 4px;
        cursor: col-resize;
        background: rgba(255, 255, 255, 0.06);
        transition: background 0.2s;
        flex-shrink: 0;
    }

    .resize-handle:hover,
    .resize-handle.active {
        background: var(--neon-blue, #00f0ff);
    }



    .explorer {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
    }

    /* Minimalist Scrollbar */
    .explorer::-webkit-scrollbar { width: 8px; }
    .explorer::-webkit-scrollbar-track { background: transparent; }
    .explorer::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
    .explorer::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

    .canvas-area {
        flex: 1;
        position: relative;
    }
</style>
