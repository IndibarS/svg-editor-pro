<script>
    import { modelStore } from '../store.js';
    import ScrubNumber from './ScrubNumber.svelte';
    import InlineColorPicker from './InlineColorPicker.svelte';

    export let tree;
    export let activeNodeId;
    export let depth = 0;

    let expanded = true;
    let dragHoverIndex = -1;

    $: isActive = activeNodeId === tree.id;

    // Derived strictly to not mutate in component scope loop directly initially
    let attributesToEdit = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'];
    if (tree.type === 'rect') attributesToEdit.push('x', 'y', 'width', 'height');
    if (tree.type === 'circle') attributesToEdit.push('cx', 'cy', 'r');
    if (tree.type === 'ellipse') attributesToEdit.push('cx', 'cy', 'rx', 'ry');
    if (tree.type === 'svg') attributesToEdit.push('width', 'height'); // viewBox is separated manually
    function isColorSetting(key) {
        return key === 'fill' || key === 'stroke';
    }

    function isNumericSetting(key) {
        return ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'stroke-width'].includes(key);
    }

    function isEnumSetting(key) {
        return ['stroke-linecap', 'stroke-linejoin'].includes(key);
    }

    const enums = {
        'stroke-linecap': ['butt', 'round', 'square'],
        'stroke-linejoin': ['miter', 'round', 'bevel']
    };

    // Ordered key sequences per command type (including derived delta keys)
    const cmdKeyOrder = {
        M: ['x', 'y', 'dx', 'dy'],
        L: ['x', 'y', 'dx', 'dy'],
        H: ['x', 'dx'],
        V: ['y', 'dy'],
        Q: ['x1', 'y1', 'dx1', 'dy1', 'x', 'y', 'dx', 'dy'],
        T: ['x', 'y', 'dx', 'dy'],
        C: ['x1', 'y1', 'dx1', 'dy1', 'x2', 'y2', 'dx2', 'dy2', 'x', 'y', 'dx', 'dy'],
        S: ['x2', 'y2', 'dx2', 'dy2', 'x', 'y', 'dx', 'dy'],
        A: ['rx', 'ry', 'xAxisRotation', 'largeArcFlag', 'sweepFlag', 'x', 'y', 'dx', 'dy'],
        Z: [],
    };

    function isDelta(k) { return k.startsWith('d') && k !== 'd'; }
    function deltaAbsKey(k) { return k.slice(1); } // dx1 → x1, dy → y
    function deltaPrevAxis(k) { return deltaAbsKey(k).includes('x') ? 'x' : 'y'; }

    const labelMap = { xAxisRotation: 'rot', largeArcFlag: 'L-Arc', sweepFlag: 'swp' };
    function keyLabel(k) { return labelMap[k] || k; }

    function updateViewBox(idx, val) {
        let parts = (tree.attributes.viewBox || "0 0 600 600").split(' ');
        parts[idx] = val;
        modelStore.updateAttribute(tree.id, 'viewBox', parts.join(' '));
    }
</script>

<div 
    class="node-block" 
    class:active={isActive} 
    class:is-hidden={tree.hidden}
    style="margin-left: {depth * 10}px"
    role="button"
    tabindex="0"
    aria-label="Select {tree.type} layer"
    on:click|stopPropagation={() => modelStore.setActive(tree.id)}
    on:keydown={(e) => e.key === 'Enter' && modelStore.setActive(tree.id)}
>
    <div class="node-header"
         role="button"
         tabindex="0"
         aria-label="Layer header"
         on:keydown={() => {}}
         draggable={tree.type !== 'svg'}
         on:dragstart={(e) => {
             if (tree.type === 'svg') { e.preventDefault(); return; }
             e.dataTransfer.setData('application/svg-node-id', tree.id);
             e.dataTransfer.dropEffect = 'move';
         }}>
        <span class="title">
            <button class="expand-btn" on:click|stopPropagation={() => expanded = !expanded}>
                <span class="material-icons" style="font-size:16px; transform:translateY(2px)">{expanded ? 'expand_more' : 'chevron_right'}</span>
            </button>
            {tree.type.toUpperCase()}
        </span>
        <div class="header-actions">
            <button class="icon-btn toggle-vis" on:click|stopPropagation={() => modelStore.toggleVisibility(tree.id)}>
                <span class="material-icons" style="font-size:16px; transform:translateY(2px)">{tree.hidden ? 'visibility_off' : 'visibility'}</span>
            </button>
            {#if tree.type !== 'svg'}
                <button class="icon-btn delete" on:click|stopPropagation={() => modelStore.deleteNode(tree.id)}>
                    <span class="material-icons" style="font-size:16px; transform:translateY(2px)">delete</span>
                </button>
            {/if}
        </div>
    </div>

        {#if expanded}
        <div class="attributes">
            {#each attributesToEdit as key}
                {@const isRoot = tree.id === $modelStore.tree.id}
                {@const globalVal = $modelStore.tree.attributes[key]}
                {@const val = tree.attributes[key] !== undefined 
                    ? tree.attributes[key] 
                    : (!isRoot && globalVal !== undefined ? globalVal : 
                       (key === 'stroke-linecap' ? 'butt' : 
                        key === 'stroke-linejoin' ? 'miter' :
                        isColorSetting(key) ? (key === 'stroke' ? '#000000' : '#00000000') : '0'))}
                <div class="attr-row" role="presentation" on:click|stopPropagation>
                    
                    {#if isColorSetting(key) && val.startsWith('#')}
                        <InlineColorPicker label={key} hexWithAlpha={val} on:change={(e) => modelStore.updateAttribute(tree.id, key, e.detail)} />
                    {:else if isNumericSetting(key)}
                        <ScrubNumber label={key} value={val} 
                            min={['width', 'height', 'r', 'stroke-width', 'cx', 'cy'].includes(key) && key!=='cx' && key!=='cy' ? 0 : -Infinity} 
                            on:change={(e) => modelStore.updateAttribute(tree.id, key, e.detail)} />
                    {:else if isEnumSetting(key)}
                        <div class="enum-selector">
                            <span class="lbl">{key.replace('stroke-', '')}</span>
                            <div class="segmented-control">
                                {#each enums[key] as option}
                                    <button 
                                        class:active={val === option} 
                                        on:click={() => modelStore.updateAttribute(tree.id, key, option)}
                                    >
                                        {option}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <!-- Fallback standard input -->
                        <div class="text-input-wrap">
                            <span class="lbl">{key}</span>
                            <input type="text" value={val} on:input={(e) => modelStore.updateAttribute(tree.id, key, e.currentTarget.value)} />
                        </div>
                    {/if}
                </div>
            {/each}

            <!-- ViewBox decoupled numerical scrubbers -->
            {#if tree.type === 'svg'}
                {@const vbParts = (tree.attributes.viewBox || "0 0 600 600").split(' ')}
                <div class="viewbox-editor">
                    <div style="font-size: 0.75rem; color:#888; margin-bottom: 4px;">viewBox</div>
                    <div style="display:flex; gap:6px;">
                        <div style="flex:1;"><ScrubNumber label="min-x" value={vbParts[0]} on:change={(e) => updateViewBox(0, e.detail)} /></div>
                        <div style="flex:1;"><ScrubNumber label="min-y" value={vbParts[1]} on:change={(e) => updateViewBox(1, e.detail)} /></div>
                    </div>
                    <div style="display:flex; gap:6px; margin-top:6px;">
                        <div style="flex:1;"><ScrubNumber label="width" value={vbParts[2]} on:change={(e) => updateViewBox(2, e.detail)} /></div>
                        <div style="flex:1;"><ScrubNumber label="height" value={vbParts[3]} on:change={(e) => updateViewBox(3, e.detail)} /></div>
                    </div>
                </div>
            {/if}

            <!-- Path Command Sub-editor -->
            {#if tree.type === 'path'}
                <div class="path-editor">
                    {#each tree.commands as cmd, i}
                        <div class="insert-divider">
                            <span class="material-icons icon-add">add</span>
                            <div class="insert-actions">
                                <button on:click={() => modelStore.addCommand(tree.id, 'M', i)}>M</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'L', i)}>L</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'H', i)}>H</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'V', i)}>V</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'C', i)}>C</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'S', i)}>S</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'Q', i)}>Q</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'T', i)}>T</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'A', i)}>A</button>
                                <button on:click={() => modelStore.addCommand(tree.id, 'Z', i)}>Z</button>
                            </div>
                        </div>
                        <div class="cmd-row">
                            <strong style="color:var(--neon-blue); width: 15px; flex-shrink: 0; padding-top: 4px;">{cmd.type}</strong>
                            <div class="cmd-params">
                                {#each (cmdKeyOrder[cmd.type] || Object.keys(cmd).filter(k => k !== 'type')) as cKey}
                                    {@const prev = i > 0 ? tree.commands[i - 1] : { x: 0, y: 0 }}
                                    {#if isDelta(cKey)}
                                        {#if i > 0}
                                        <div class="cmd-param">
                                            <ScrubNumber label={cKey} value={cmd[deltaAbsKey(cKey)] - (prev[deltaPrevAxis(cKey)] || 0)} on:change={(e) => modelStore.updateCommand(tree.id, i, deltaAbsKey(cKey), (prev[deltaPrevAxis(cKey)] || 0) + e.detail)} />
                                        </div>
                                        {/if}
                                    {:else if cKey === 'largeArcFlag' || cKey === 'sweepFlag'}
                                        <div class="cmd-param">
                                            <div class="flag-toggle" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); padding: 0 6px; border-radius: 4px; height: 24px; min-width: 60px; border: 1px solid rgba(255,255,255,0.05);">
                                                <span style="color: #888; font-size: 10px; user-select: none;">{keyLabel(cKey)}</span>
                                                <input type="checkbox" style="margin: 0; width: 12px; height: 12px; cursor: pointer; accent-color: var(--neon-blue);" checked={cmd[cKey] === 1} on:change={(e) => modelStore.updateCommand(tree.id, i, cKey, e.currentTarget.checked ? 1 : 0)} />
                                            </div>
                                        </div>
                                    {:else}
                                        <div class="cmd-param">
                                            <ScrubNumber label={keyLabel(cKey)} value={cmd[cKey]} on:change={(e) => {
                                                let v = e.detail;
                                                if (cKey === 'xAxisRotation') v = ((v % 180) + 180) % 180;
                                                modelStore.updateCommand(tree.id, i, cKey, v);
                                            }} />
                                        </div>
                                    {/if}
                                {/each}
                            </div>
                            <button class="icon-btn delete" style="padding: 0 4px; flex-shrink: 0; align-self: flex-start; padding-top: 6px;" on:click={() => modelStore.deleteCommand(tree.id, i)}>
                                <span class="material-icons" style="font-size:16px;">close</span>
                            </button>
                        </div>
                    {/each}
                    <div class="insert-divider">
                        <span class="material-icons icon-add">add</span>
                        <div class="insert-actions">
                            <button on:click={() => modelStore.addCommand(tree.id, 'M', tree.commands.length)}>M</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'L', tree.commands.length)}>L</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'H', tree.commands.length)}>H</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'V', tree.commands.length)}>V</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'C', tree.commands.length)}>C</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'S', tree.commands.length)}>S</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'Q', tree.commands.length)}>Q</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'T', tree.commands.length)}>T</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'A', tree.commands.length)}>A</button>
                            <button on:click={() => modelStore.addCommand(tree.id, 'Z', tree.commands.length)}>Z</button>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>

{#if expanded}
    {#each tree.children || [] as child, index (child.id)}
            <div 
                class="insert-divider element-divider" 
                class:drag-over={dragHoverIndex === index} 
                style="margin-left: {depth * 10}px"
                role="button"
                tabindex="0"
                aria-label="Insert element here"
                on:keydown={() => {}}
                on:dragover|preventDefault
                on:dragenter={() => dragHoverIndex = index}
                on:dragleave={() => { if(dragHoverIndex === index) dragHoverIndex = -1; }}
                on:drop={(e) => {
                    dragHoverIndex = -1;
                    const draggedId = e.dataTransfer.getData('application/svg-node-id');
                    if (draggedId) modelStore.moveNode(draggedId, tree.id, index);
                }}>
            <span class="material-icons icon-add">add</span>
            <div class="insert-actions">
                <button on:click={() => modelStore.addElement('rect', tree.id, index)}>Rect</button>
                <button on:click={() => modelStore.addElement('circle', tree.id, index)}>Circle</button>
                <button on:click={() => modelStore.addElement('ellipse', tree.id, index)}>Ellipse</button>
                <button on:click={() => modelStore.addElement('path', tree.id, index)}>Path</button>
                <button on:click={() => modelStore.addElement('g', tree.id, index)}>Group</button>
            </div>
        </div>
        <svelte:self tree={child} activeNodeId={activeNodeId} depth={depth + 1} />
    {/each}
    {#if (tree.children || []).length > 0 || tree.type === 'svg' || tree.type === 'g'}
        <!-- Trailing spacer for elements so inserting at bottom works natively too -->
        {@const tIndex = (tree.children || []).length}
        <div 
                class="insert-divider element-divider" 
                class:drag-over={dragHoverIndex === tIndex} 
                style="margin-left: {depth * 10}px"
                role="button"
                tabindex="0"
                aria-label="Insert element at bottom"
                on:keydown={() => {}}
                on:dragover|preventDefault
                on:dragenter={() => dragHoverIndex = tIndex}
                on:dragleave={() => { if(dragHoverIndex === tIndex) dragHoverIndex = -1; }}
                on:drop={(e) => {
                    dragHoverIndex = -1;
                    const draggedId = e.dataTransfer.getData('application/svg-node-id');
                    if (draggedId) modelStore.moveNode(draggedId, tree.id, tIndex);
                }}>
            <span class="material-icons icon-add">add</span>
            <div class="insert-actions">
                <button on:click={() => modelStore.addElement('rect', tree.id, (tree.children || []).length)}>Rect</button>
                <button on:click={() => modelStore.addElement('circle', tree.id, (tree.children || []).length)}>Circle</button>
                <button on:click={() => modelStore.addElement('ellipse', tree.id, (tree.children || []).length)}>Ellipse</button>
                <button on:click={() => modelStore.addElement('path', tree.id, (tree.children || []).length)}>Path</button>
                <button on:click={() => modelStore.addElement('g', tree.id, (tree.children || []).length)}>Group</button>
            </div>
        </div>
    {/if}
{/if}

<style>
    .node-block {
        background-color: #1a1a1a;
        border: 1px solid #333;
        border-radius: 6px;
        overflow: hidden;
        transition: all 0.2s;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    }

    .node-block.active {
        border-color: #00f0ff;
        box-shadow: 0 0 10px rgba(0, 240, 255, 0.2);
    }

    .node-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: #222;
        border-bottom: 1px solid #333;
    }

    .title {
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
        color: #eee;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .expand-btn {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 0.7rem;
    }

    .icon-btn {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        display: flex;
        align-items: center;
    }
    
    .icon-btn.delete:hover {
        color: #ff3366;
    }

    .icon-btn.toggle-vis:hover {
        color: #00f0ff;
    }

    .node-header .header-actions {
        display: flex;
        gap: 6px;
    }

    .node-block.is-hidden .title {
        opacity: 0.4;
    }
    
    .node-block.is-hidden .icon-btn.toggle-vis {
        color: #555;
    }

    .attributes {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .attr-row {
        display: flex;
        align-items: center;
    }

    .lbl {
        font-size: 0.75rem; 
        width: 50px; 
        color: #888;
    }

    .text-input-wrap {
        display: flex;
        align-items: center;
        width: 100%;
        background: #111;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 4px 8px;
    }
    
    .text-input-wrap input {
        flex: 1;
        background: transparent;
        color: #eee;
        border: none;
        outline: none;
        width: 100%;
        font-family: inherit;
        font-size: 0.85rem;
    }

    /* Path Editor */
    .path-editor {
        margin-top: 8px;
        padding: 8px;
        background: #111;
        border: 1px solid #333;
        border-radius: 4px;
        display: flex;
        flex-direction: column;
    }

    .viewbox-editor {
        margin-top: 8px;
        padding: 8px;
        background: #111;
        border: 1px solid #333;
        border-radius: 4px;
    }

    .cmd-row {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin-bottom: 2px;
    }

    .cmd-params {
        flex: 1;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .cmd-param {
        flex: 1 1 40%;
        min-width: 60px;
    }

    /* Jupyter Style Insert Dividers */
    .insert-divider {
        position: relative;
        height: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s;
        margin: 2px 0;
    }
    
    .element-divider {
        height: 16px;
    }

    .insert-divider::before {
        content: '';
        position: absolute;
        top: 50%; left: 0; right: 0;
        height: 1px;
        background: var(--neon-blue);
        z-index: 1;
        transition: all 0.2s;
    }

    .insert-divider.drag-over {
        opacity: 1;
    }

    .insert-divider.drag-over::before {
        height: 4px;
        background: #00f0ff;
        box-shadow: 0 0 10px #00f0ff;
    }

    .insert-divider:hover {
        opacity: 1;
    }

    .icon-add {
        position: relative;
        z-index: 2;
        background: #000;
        color: var(--neon-blue);
        font-size: 16px;
        border-radius: 50%;
        border: 1px solid var(--neon-blue);
        cursor: pointer;
    }

    .insert-actions {
        display: none;
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: #222;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 4px;
        z-index: 10;
        box-shadow: 0 4px 6px rgba(0,0,0,0.5);
    }

    .insert-divider:hover .insert-actions {
        display: flex;
        gap: 4px;
    }

    .insert-actions button {
        background: transparent;
        border: none;
        color: #ddd;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 0.75rem;
        border-radius: 2px;
    }

    .insert-actions button:hover {
        background: #333;
        color: var(--neon-blue);
    }

    /* Enum / Segmented Control */
    .enum-selector {
        display: flex;
        align-items: center;
        width: 100%;
    }

    .segmented-control {
        display: flex;
        background: #111;
        border: 1px solid #333;
        border-radius: 4px;
        overflow: hidden;
        flex: 1;
    }

    .segmented-control button {
        flex: 1;
        background: transparent;
        border: none;
        color: #888;
        padding: 4px 2px;
        cursor: pointer;
        font-size: 0.7rem;
        transition: all 0.2s;
        border-right: 1px solid #222;
    }

    .segmented-control button:last-child {
        border-right: none;
    }

    .segmented-control button.active {
        background: #333;
        color: var(--neon-blue);
        font-weight: bold;
    }

    .segmented-control button:hover:not(.active) {
        background: #222;
        color: #bbb;
    }
</style>
