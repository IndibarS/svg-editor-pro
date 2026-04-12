<script>
    import { fade, scale } from "svelte/transition";
    import { backOut } from "svelte/easing";

    export let show = false;
    export let onClose = () => {};

    import qrImage from "../assets/gpay_qr.jpeg";

    function handleKeydown(e) {
        if (e.key === "Escape") onClose();
    }
</script>

{#if show}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
        class="modal-backdrop"
        on:click={onClose}
        transition:fade={{ duration: 200 }}
    >
        <div
            class="modal-content elevation-4"
            on:click|stopPropagation
            transition:scale={{
                duration: 400,
                delay: 50,
                easing: backOut,
                start: 0.8,
            }}
        >
            <button class="close-btn" on:click={onClose}>
                <span class="material-icons">close</span>
            </button>

            <div class="header">
                <span class="material-icons coffee-icon">coffee</span>
                <h2>Buy me a coffee</h2>
            </div>

            <p class="description">
                If you find this SVG editor helpful, consider supporting its
                development. Scan the QR code below to pay with GPay.
            </p>

            <div class="qr-container">
                <img src={qrImage} alt="GPay QR Code" class="qr-code" />
                <div class="qr-overlay"></div>
            </div>

            <div class="footer">
                <p class="upi-id">UPI ID: indibar.sarkar075@okaxis</p>
                <p>Thank you for your support! ❤️</p>
                <button class="btn btn-contained" on:click={onClose}
                    >Done</button
                >
            </div>
        </div>
    </div>
{/if}

<svelte:window on:keydown={handleKeydown} />

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
    }

    .modal-content {
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        width: 100%;
        max-width: 400px;
        padding: 32px;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.5),
            0 0 20px rgba(0, 240, 255, 0.1);
    }

    .close-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    .header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
    }

    .coffee-icon {
        color: #ff9800;
        font-size: 32px;
    }

    h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 500;
        color: #fff;
    }

    .description {
        color: #aaa;
        font-size: 14px;
        line-height: 1.6;
        margin-bottom: 24px;
    }

    .qr-container {
        position: relative;
        background: #fff;
        padding: 12px;
        border-radius: 16px;
        margin-bottom: 24px;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
        overflow: hidden;
    }

    .qr-code {
        width: 220px;
        height: 220px;
        display: block;
        border-radius: 8px;
    }

    .footer {
        width: 100%;
    }

    .footer p {
        color: #888;
        font-size: 13px;
        margin-bottom: 20px;
    }

    .btn-contained {
        width: 100%;
        height: 48px;
        border-radius: 12px;
        font-size: 16px;
        background: var(--neon-blue, #00f0ff);
        color: #000;
    }

    .btn-contained:hover {
        background: #00d8e6;
        box-shadow: 0 0 15px rgba(0, 240, 255, 0.4);
    }
</style>
