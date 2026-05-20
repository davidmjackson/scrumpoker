(function attachClipboard(window) {
    // Copy text to the clipboard, falling back to a hidden textarea for
    // browsers (or insecure contexts) without the async Clipboard API.
    async function copyText(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    window.ScrumPokerClipboard = { copyText };
})(window);
