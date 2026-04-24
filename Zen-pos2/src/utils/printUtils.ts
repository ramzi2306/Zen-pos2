/**
 * Unified printing utility for ZenPOS.
 * Handles printing via a hidden iframe to prevent freezing the main window thread,
 * which helps avoid "Unchecked runtime.lastError" in Chrome extensions.
 */

export function firePrint(html: string): void {
  const iframe = document.createElement('iframe');
  
  // Hide the iframe securely
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none;';
  
  document.body.appendChild(iframe);
  
  if (iframe.contentWindow) {
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      // Small delay to ensure the browser has finished its print hand-off
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    };

    // The 'afterprint' event is the cleanest way to detect completion
    iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
    
    // Fallback: If afterprint never fires (e.g. user keeps dialog open for a long time then browser cancels),
    // we still want to clean up eventually.
    setTimeout(cleanup, 60000); // 1 minute safety net
  } else {
    // Fallback for extreme cases: just print the main window (less ideal)
    console.warn('[Print] Iframe contentWindow not available, falling back to window.print()');
    window.print();
  }
}

/**
 * Wraps existing document content in a basic HTML structure for printing.
 */
export function printElement(elementId: string, title?: string): void {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`[Print] Element with ID "${elementId}" not found.`);
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title || 'ZenPOS Print'}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #000; }
          @media print {
            body { padding: 0; }
          }
          /* Copy some basic Tailwind-like utility styles that might be used in the content */
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .font-bold { font-weight: bold; }
          .text-right { text-align: right; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
        </style>
      </head>
      <body>
        ${element.innerHTML}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  firePrint(html);
}
