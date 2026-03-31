export async function copyTextWithFallback(text, options = {}) {
    const promptLabel = options.promptLabel || 'Copy this text:';
    const allowPromptFallback = options.allowPromptFallback !== false;

    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return { copied: true, method: 'clipboard' };
        }
    } catch {
        // Continue to fallback when clipboard write fails.
    }

    if (allowPromptFallback && typeof window !== 'undefined' && typeof window.prompt === 'function') {
        window.prompt(promptLabel, text);
        return { copied: false, method: 'prompt' };
    }

    return { copied: false, method: 'none' };
}
