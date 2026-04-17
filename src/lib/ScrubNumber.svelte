<script>
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();
    
    export let value = 0;
    export let label = '';
    export let min = -Infinity;
    export let max = Infinity;
    
    let dragging = false;
    let startX = 0;
    let startVal = 0;

    function handlePointerDown(e) {
        dragging = true;
        startX = e.clientX;
        // Parse float handles strings properly, otherwise default to 0
        startVal = value;
        if (isNaN(startVal)) startVal = 0;
        
        // Optional pointer lock for infinite scrubbing avoiding screen edges
        if (e.target.requestPointerLock) e.target.requestPointerLock();
    }

    function handlePointerMove(e) {
        if (!dragging) return;
        
        // If pointer lock is active, use movementX, otherwise use clientX delta
        let dx = 0;
        if (document.pointerLockElement) {
            dx = e.movementX;
            startVal += dx;
            value = Math.max(min, Math.min(max, Math.round(startVal))); // 1-to-1 sensitivity
        } else {
            dx = e.clientX - startX;
            value = Math.max(min, Math.min(max, Math.round(startVal + dx)));
        }
        
        dispatch('change', value);
    }

    function handlePointerUp() {
        if (dragging) {
            dragging = false;
            if (document.exitPointerLock) document.exitPointerLock();
        }
    }
    
    function handleInputChange() {
        const parsed = parseFloat(String(value));
        value = isNaN(parsed) ? 0 : parsed;
        dispatch('change', value);
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') {
            handleInputChange();
            e.target.blur();
        }
    }
</script>

<svelte:window on:pointermove={handlePointerMove} on:pointerup={handlePointerUp} />

<div class="scrub-wrapper">
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="scrub-label" on:pointerdown={handlePointerDown} style="cursor: ew-resize;" title="Drag to adjust length">
        {label}
    </div>
    <input type="text" bind:value class="scrub-input" on:change={handleInputChange} on:keydown={handleKeyDown} />
</div>

<style>
    .scrub-wrapper {
        display: flex;
        background: #111;
        border: 1px solid #333;
        border-radius: 4px;
        overflow: hidden;
        align-items: stretch;
        transition: border-color 0.2s;
    }
    
    .scrub-wrapper:focus-within {
        border-color: #00f0ff;
    }

    .scrub-label {
        background: #252525;
        color: #bbb;
        padding: 4px 8px;
        font-size: 0.75rem;
        user-select: none;
        display: flex;
        align-items: center;
        border-right: 1px solid #333;
        font-weight: 500;
        min-width: 25px;
        justify-content: center;
    }
    
    .scrub-label:hover {
        background: #333;
        color: #fff;
    }

    .scrub-input {
        flex: 1;
        background: transparent;
        color: #eee;
        border: none;
        padding: 4px 6px;
        font-size: 0.85rem;
        width: 100%;
        min-width: 40px;
        outline: none;
        font-family: monospace;
    }
</style>
