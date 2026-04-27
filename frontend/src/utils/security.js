/**
 * Kairo Security Shield
 * Locks down DevTools access, right-click, keyboard shortcuts,
 * and source viewing. Call initSecurity() once at app mount.
 */

export const initSecurity = () => {
  // --- Disable Right-Click Context Menu ---
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // --- Block Dangerous Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // F12 - DevTools
    if (e.key === 'F12') { e.preventDefault(); return false; }

    // Ctrl+Shift+I - DevTools
    if (ctrl && shift && (e.key === 'I' || e.key === 'i')) { e.preventDefault(); return false; }

    // Ctrl+Shift+J - Console
    if (ctrl && shift && (e.key === 'J' || e.key === 'j')) { e.preventDefault(); return false; }

    // Ctrl+Shift+C - Inspect element
    if (ctrl && shift && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); return false; }

    // Ctrl+U - View Source
    if (ctrl && (e.key === 'U' || e.key === 'u') && !shift) { e.preventDefault(); return false; }

    // Ctrl+S - Save Page
    if (ctrl && (e.key === 'S' || e.key === 's') && !shift) { e.preventDefault(); return false; }

    // Ctrl+P - Print (can expose source)
    if (ctrl && (e.key === 'P' || e.key === 'p') && !shift) { e.preventDefault(); return false; }

    // F5 / Ctrl+R - hard refresh (disables back-button snooping)
    // Note: we allow reload but this is a placeholder if needed
  }, true);

  // --- Disable Text Selection on UI chrome (not chat text) ---
  document.addEventListener('selectstart', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  // --- DevTools Detection via timing trick ---
  setInterval(() => {
    const before = performance.now();
    // eslint-disable-next-line no-console
    console.profile();
    // eslint-disable-next-line no-console
    console.profileEnd();
    const after = performance.now();
    if (after - before > 100) {
      // DevTools likely open - clear console and warn
      // eslint-disable-next-line no-console
      console.clear();
    }
  }, 2000);

  // --- Override console to prevent data extraction via console ---
  const noop = () => undefined;
  const consoleMethods = ['log', 'debug', 'info', 'warn', 'error', 'dir', 'dirxml', 'table', 'trace', 'group', 'groupCollapsed', 'groupEnd', 'clear', 'count', 'assert', 'profile', 'profileEnd'];
  consoleMethods.forEach(method => {
    try {
      // eslint-disable-next-line no-console
      console[method] = noop;
    } catch (_) { /* ignore */ }
  });
};

/**
 * Generates a secure blob: URL from a Uint8Array of image bytes.
 * The blob URL lives ONLY in RAM and dies when the page is closed.
 * Copying it to a new tab shows nothing.
 */
export const createEphemeralBlobUrl = (bytes, mimeType = 'image/jpeg') => {
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
};

/**
 * Revokes a blob URL from memory to prevent accumulation.
 */
export const revokeBlobUrl = (url) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

/**
 * Extreme Input Sanitization to destroy invisible control characters 
 * used in buffer overflow or unicode attacks.
 */
export const sanitizeText = (input) => {
  if (!input || typeof input !== 'string') return '';
  // Strip control characters except newline and tab
  return input.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

/**
 * Strict URL validator to prevent XSS via media links (e.g., javascript:)
 */
export const validateMediaUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (['http:', 'https:', 'blob:'].includes(parsed.protocol)) {
      return url;
    }
    return null;
  } catch {
    return null; // Invalid URL
  }
};
