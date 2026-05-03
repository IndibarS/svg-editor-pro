<script>
    import { modelStore } from './store.js';
    import Sidebar from './lib/Sidebar.svelte';
    import Canvas from './lib/Canvas.svelte';
    import SupportModal from './lib/SupportModal.svelte';

    let selectedElement = 'path';
    let sidebarWidth = 320;
    let resizing = false;
    let showSupportModal = false;

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

    // ─── Global Context Menu ───────────────────────────────────────────────────
    const MENU_W = 220;
    const MENU_H = 230;

    let ctxMenu = { visible: false, x: 0, y: 0, nodeId: null };

    function handleGlobalContextMenu(e) {
        // Don't override menus inside native inputs
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

        e.preventDefault();

        // Resolve which node was right-clicked (canvas shape, sidebar block, or active)
        const dataIdEl  = e.target.closest('[data-id]');
        const dataNidEl = e.target.closest('[data-node-id]');

        let nodeId = null;
        const rootId = $modelStore.tree.id;

        if (dataIdEl) {
            const id = dataIdEl.getAttribute('data-id');
            if (id && id !== rootId) nodeId = id;
        } else if (dataNidEl) {
            const id = dataNidEl.getAttribute('data-node-id');
            if (id && id !== rootId) nodeId = id;
        }

        // Fall back to whatever is currently active
        if (!nodeId) {
            const aid = $modelStore.activeNodeId;
            if (aid && aid !== rootId) nodeId = aid;
        }

        if (nodeId) modelStore.setActive(nodeId);

        // Flip menu position if it would overflow the viewport
        const x = e.clientX + MENU_W > window.innerWidth  ? e.clientX - MENU_W : e.clientX;
        const y = e.clientY + MENU_H > window.innerHeight ? e.clientY - MENU_H : e.clientY;

        ctxMenu = { visible: true, x, y, nodeId };
    }

    function closeCtxMenu() {
        if (ctxMenu.visible) ctxMenu = { ...ctxMenu, visible: false };
    }

    function ctxAction(fn) {
        closeCtxMenu();
        fn();
    }

    function handleGlobalKeydown(e) {
        if (e.key === 'Escape') closeCtxMenu();
    }
</script>

<svelte:window
    on:contextmenu={handleGlobalContextMenu}
    on:click={closeCtxMenu}
    on:keydown={handleGlobalKeydown}
/>

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
            <button class="icon-btn coffee-btn" style="margin-left: 12px;" on:click={() => showSupportModal = true} aria-label="Support the creator">
                <span class="material-icons">coffee</span>
            </button>
        </div>
    </header>

    <!-- svelte-ignore a11y-no-static-element-interactions -->
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

    <SupportModal 
        show={showSupportModal} 
        onClose={() => showSupportModal = false} 
    />

    <!-- Global Context Menu -->
    {#if ctxMenu.visible}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="ctx-menu"
            style="left: {ctxMenu.x}px; top: {ctxMenu.y}px;"
            on:click|stopPropagation
            on:contextmenu|preventDefault|stopPropagation
        >
            {#if ctxMenu.nodeId}
                {@const isHidden = modelStore.isEffectivelyHidden($modelStore.tree, ctxMenu.nodeId)}
                <button class="ctx-item" on:click={() => ctxAction(() => modelStore.copyNode(ctxMenu.nodeId))}>
                    <span class="material-icons ctx-icon">content_copy</span>
                    Copy
                    <span class="ctx-shortcut">Ctrl+C</span>
                </button>
                <button class="ctx-item" on:click={() => ctxAction(() => modelStore.cutNode(ctxMenu.nodeId))}>
                    <span class="material-icons ctx-icon">content_cut</span>
                    Cut
                    <span class="ctx-shortcut">Ctrl+X</span>
                </button>
                <button class="ctx-item" on:click={() => ctxAction(() => modelStore.pasteNode())}>
                    <span class="material-icons ctx-icon">content_paste</span>
                    Paste
                    <span class="ctx-shortcut">Ctrl+V</span>
                </button>
                <button class="ctx-item" on:click={() => ctxAction(() => modelStore.duplicateNode(ctxMenu.nodeId))}>
                    <span class="material-icons ctx-icon">copy_all</span>
                    Duplicate
                    <span class="ctx-shortcut">Ctrl+D</span>
                </button>
                <div class="ctx-separator"></div>
                <button class="ctx-item" on:click={() => ctxAction(() => modelStore.toggleVisibility(ctxMenu.nodeId))}>
                    <span class="material-icons ctx-icon">{isHidden ? 'visibility' : 'visibility_off'}</span>
                    {isHidden ? 'Show' : 'Hide'}
                    <span class="ctx-shortcut">Ctrl+H</span>
                </button>
                <button class="ctx-item ctx-danger" on:click={() => ctxAction(() => modelStore.deleteNode(ctxMenu.nodeId))}>
                    <span class="material-icons ctx-icon">delete</span>
                    Delete
                    <span class="ctx-shortcut">Del</span>
                </button>
            {:else}
                <button class="ctx-item" on:click={() => ctxAction(() => modelStore.pasteNode())}>
                    <span class="material-icons ctx-icon">content_paste</span>
                    Paste
                    <span class="ctx-shortcut">Ctrl+V</span>
                </button>
                <button class="ctx-item" on:click={() => ctxAction(() => modelStore.unhideAll())}>
                    <span class="material-icons ctx-icon">visibility</span>
                    Unhide All
                    <span class="ctx-shortcut">Ctrl+Alt+H</span>
                </button>
            {/if}
        </div>
    {/if}
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

    .icon-btn {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        border-radius: 50%;
        transition: all 0.2s;
    }

    .icon-btn:hover {
        background: rgba(255, 255, 255, 0.05);
    }

    .coffee-btn {
        color: #ff9800;
    }

    .coffee-btn:hover {
        color: #ffa726;
        background: rgba(255, 152, 0, 0.1);
    }

    .coffee-btn .material-icons {
        font-size: 24px;
    }

    /* ── Global Context Menu ── */
    .ctx-menu {
        position: fixed;
        z-index: 9999;
        min-width: 220px;
        background: rgba(18, 18, 22, 0.94);
        backdrop-filter: blur(20px) saturate(1.5);
        -webkit-backdrop-filter: blur(20px) saturate(1.5);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 10px;
        padding: 5px;
        box-shadow:
            0 12px 40px rgba(0, 0, 0, 0.7),
            0 0 0 0.5px rgba(0, 240, 255, 0.07) inset;
        animation: ctx-in 0.1s cubic-bezier(0.2, 0, 0, 1) both;
        transform-origin: top left;
    }

    @keyframes ctx-in {
        from { opacity: 0; transform: scale(0.93) translateY(-4px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
    }

    .ctx-item {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        background: none;
        border: none;
        color: #d5d5d5;
        font-size: 0.82rem;
        font-family: inherit;
        padding: 7px 10px;
        border-radius: 6px;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s, color 0.1s;
        white-space: nowrap;
    }

    .ctx-item:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
    }

    .ctx-item.ctx-danger { color: #ff4d6d; }
    .ctx-item.ctx-danger:hover {
        background: rgba(255, 60, 100, 0.14);
        color: #ff7090;
    }

    .ctx-icon {
        font-size: 15px;
        color: #555;
        flex-shrink: 0;
        transition: color 0.1s;
    }
    .ctx-item:hover .ctx-icon { color: #00f0ff; }
    .ctx-item.ctx-danger:hover .ctx-icon { color: #ff7090; }

    .ctx-shortcut {
        margin-left: auto;
        font-size: 0.7rem;
        color: #3a3a3a;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        padding-left: 18px;
    }

    .ctx-separator {
        height: 1px;
        background: rgba(255, 255, 255, 0.06);
        margin: 4px 6px;
    }
</style>
