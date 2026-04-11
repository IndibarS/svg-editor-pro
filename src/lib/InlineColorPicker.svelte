<script>
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let label = '';
    export let hexWithAlpha = '#00f0ff'; // default

    function hsvaToRgba(h, s, v) {
        let r, g, b;
        h /= 360; s /= 100; v /= 100;
        let i = Math.floor(h * 6);
        let f = h * 6 - i;
        let p = v * (1 - s);
        let q = v * (1 - f * s);
        let t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    function rgbaToHsva(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max !== min) {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            } 
            h /= 6;
        }
        return { h: h * 360, s: s * 100, v: v * 100 };
    }

    let r=0,g=0,b=0,a=255;
    let h=0,s=0,v=0,alphaPct=100;
    let lastDispatchedHex = '';

    $: {
        if (hexWithAlpha.length >= 7 && hexWithAlpha.toUpperCase() !== lastDispatchedHex) {
            r = parseInt(hexWithAlpha.slice(1,3), 16) || 0;
            g = parseInt(hexWithAlpha.slice(3,5), 16) || 0;
            b = parseInt(hexWithAlpha.slice(5,7), 16) || 0;
            a = hexWithAlpha.length >= 9 ? parseInt(hexWithAlpha.slice(7,9), 16) : 255;
            
            let derived = rgbaToHsva(r, g, b);
            if (derived.s !== 0 || h === 0) h = derived.h;
            if (derived.v !== 0 || s === 0) s = derived.s;
            v = derived.v;
            alphaPct = Math.round((a / 255) * 100);
        }
    }
    
    let expanded = false;
    let boardEl;
    let draggingBoard = false;

    $: rawOpaque = `#${hsvaToRgba(h, s, v).r.toString(16).padStart(2,'0')}${hsvaToRgba(h, s, v).g.toString(16).padStart(2,'0')}${hsvaToRgba(h, s, v).b.toString(16).padStart(2,'0')}`;

    // Window global mouse trackers for absolute smooth 2D bounding
    function handlePointerMove(e) {
        if (!draggingBoard || !boardEl) return;
        const rect = boardEl.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;
        s = Math.max(0, Math.min(100, (x / rect.width) * 100));
        v = Math.max(0, Math.min(100, 100 - (y / rect.height) * 100));
        dispatchHsva();
    }

    function handlePointerUp() {
        if (draggingBoard) draggingBoard = false;
    }

    function dispatchHsva() {
        const {r: nr, g: ng, b: nb} = hsvaToRgba(h, s, v);
        const toHex = (n) => n.toString(16).padStart(2,'0');
        let na = Math.round(alphaPct * 2.55);
        let newHex = `#${toHex(nr)}${toHex(ng)}${toHex(nb)}${na === 255 ? '' : toHex(na)}`;
        lastDispatchedHex = newHex.toUpperCase();
        dispatch('change', newHex);
    }
</script>

<svelte:window on:pointermove={handlePointerMove} on:pointerup={handlePointerUp} />

<div class="picker-container">
    <div class="swatch-row">
        {#if label}
            <span class="lbl">{label}</span>
        {/if}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="color-preview" on:click={() => expanded = !expanded}>
            <div class="checker-bg"></div>
            <div class="preview-inner" style="background-color: {hexWithAlpha.substring(0,7)}; opacity: {alphaPct/100};"></div>
        </div>
        <span class="hex-text">{hexWithAlpha.toUpperCase()}</span>
    </div>

    {#if expanded}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="dropdown-backdrop" on:click={() => expanded = false}></div>
        <div class="dropdown">
            
            <!-- 2D Hue/Saturation/Value Board -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="color-board" bind:this={boardEl} on:pointerdown={(e) => { draggingBoard = true; handlePointerMove(e); }}
                 style="background-color: hsl({h}, 100%, 50%);">
                <div class="board-layer white-fade"></div>
                <div class="board-layer black-fade"></div>
                <div class="board-thumb" style="left: {s}%; top: {100 - v}%; background: {hexWithAlpha.substring(0,7)}"></div>
            </div>

            <!-- Hue Slider -->
            <div class="slider-row">
                <span class="label-tiny">H</span>
                <input type="range" min="0" max="360" bind:value={h} on:input={dispatchHsva} 
                    style="background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)">
            </div>
            
            <!-- Alpha Slider -->
            <div class="slider-row alpha-row">
                <span class="label-tiny">A</span>
                <div class="checker-bg slider-bg"></div>
                <input type="range" min="0" max="100" bind:value={alphaPct} on:input={dispatchHsva} 
                    style="background: linear-gradient(to right, transparent, {rawOpaque})">
            </div>
            
        </div>
    {/if}
</div>

<style>
    .picker-container {
        position: relative;
        width: 100%;
        background: #111;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 4px 8px;
    }

    .swatch-row {
        display: flex;
        align-items: center;
        width: 100%;
        gap: 8px;
    }

    .lbl {
        font-size: 0.75rem; 
        width: 42px; 
        color: #888;
    }

    .color-preview {
        position: relative;
        width: 32px;
        height: 18px;
        border: 1px solid #444;
        border-radius: 4px;
        cursor: pointer;
        overflow: hidden;
    }

    .checker-bg {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: #eee;
        background-image: 
            linear-gradient(45deg, #ccc 25%, transparent 25%), 
            linear-gradient(-45deg, #ccc 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, #ccc 75%), 
            linear-gradient(-45deg, transparent 75%, #ccc 75%);
        background-size: 8px 8px;
        background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
        z-index: 1;
    }

    .preview-inner {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 2;
    }

    .hex-text {
        font-family: monospace;
        font-size: 0.85rem;
        color: #eee;
        flex: 1;
    }

    .dropdown-backdrop {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 99;
    }

    .dropdown {
        position: relative;
        margin-top: 8px;
        width: 100%;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 6px;
        padding: 12px;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .color-board {
        position: relative;
        width: 100%;
        height: 140px;
        border-radius: 4px;
        overflow: hidden;
        cursor: crosshair;
        touch-action: none; /* Prevent scroll on touch devices when dragging */
    }

    .board-layer {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none;
    }

    .white-fade {
        background: linear-gradient(to right, #fff 0%, transparent 100%);
    }

    .black-fade {
        background: linear-gradient(to bottom, transparent 0%, #000 100%);
    }

    .board-thumb {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 2px rgba(0,0,0,0.8), inset 0 0 1px rgba(0,0,0,0.3);
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 10;
    }

    .slider-row {
        display: flex;
        align-items: center;
        gap: 8px;
        position: relative;
    }

    .alpha-row .slider-bg {
        top: 4px; bottom: 4px; left: 24px; right: 0;
        border-radius: 4px;
    }

    .label-tiny {
        font-size: 10px;
        color: #888;
        width: 16px;
        font-weight: bold;
    }

    input[type=range] {
        -webkit-appearance: none;
        width: 100%;
        height: 10px;
        border-radius: 5px;
        outline: none;
        position: relative;
        z-index: 3;
    }
    input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid #333;
        cursor: pointer;
        box-shadow: 0 0 2px rgba(0,0,0,0.5);
    }
</style>
