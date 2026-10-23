import { jsPDF } from 'jspdf';

export interface PdfDownloadResult {
  success: boolean;
  blobUrl: string;
  dataUri: string;
  filename: string;
  serverDownloadUrl?: string;
  error?: string;
}

/**
 * Executes a clean print bridge inside an isolated off-screen iframe to bypass sandbox restrictions
 * and launch the browser's native Print / Save-as-PDF dialog with A4 Landscape rules.
 */
export function printElementInIframe(elementId: string): boolean {
  try {
    const elem = document.getElementById(elementId);
    if (!elem) {
      console.warn(`Element #${elementId} not found for iframe print bridge, falling back to window.print()`);
      try { window.print(); } catch {}
      return true;
    }

    // Clean up any existing print frames first
    const oldFrame = document.getElementById('moe-pdf-print-frame');
    if (oldFrame && oldFrame.parentNode) {
      oldFrame.parentNode.removeChild(oldFrame);
    }

    // Create an off-screen iframe (visible to renderer but hidden offscreen so print engine works)
    const iframe = document.createElement('iframe');
    iframe.id = 'moe-pdf-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = '1100px';
    iframe.style.height = '1600px';
    iframe.style.border = '0';
    iframe.style.opacity = '0.01';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      try { window.print(); } catch {}
      return true;
    }

    // Collect all stylesheets and style rules from current page
    let headStyles = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((styleTag) => {
      headStyles += styleTag.outerHTML;
    });

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>استمارة الفحص والتدقيق النهائي - وزارة التربية والتعليم</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@300;400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
        ${headStyles}
        <style>
          @page {
            size: A4 landscape !important;
            margin: 4mm 6mm !important;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: 'Cairo', 'Almarai', 'Tajawal', 'Amiri', sans-serif !important;
            width: 100% !important;
            height: auto !important;
          }
          .print-iframe-wrapper {
            width: 100% !important;
            max-width: 287mm !important;
            margin: 0 auto !important;
            padding: 2mm !important;
          }
          #${elementId} {
            transform: none !important;
            margin: 0 auto !important;
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
            border-color: #821315 !important;
          }
          button, .no-print {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div class="print-iframe-wrapper">
          ${elem.outerHTML}
        </div>
      </body>
      </html>
    `);
    doc.close();

    // Trigger iframe print after a tiny tick
    setTimeout(() => {
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
      } catch (e) {
        console.warn('Iframe print warning, falling back to window.print():', e);
        try { window.print(); } catch {}
      }
    }, 400);

    // Clean up iframe after 30 seconds
    setTimeout(() => {
      try {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      } catch {}
    }, 30000);

    return true;
  } catch (err) {
    console.error('Error executing iframe print bridge:', err);
    try { window.print(); } catch {}
    return false;
  }
}

/**
 * Downloads a jsPDF document directly and automatically to the user's disk
 * via a client-side Blob URL anchor trigger without opening any new tab,
 * popup window, or iframe navigation.
 */
export async function executePdfDownload(pdf: jsPDF, defaultFilename: string): Promise<PdfDownloadResult> {
  const cleanFilename = defaultFilename.endsWith('.pdf') ? defaultFilename : `${defaultFilename}.pdf`;
  
  try {
    // 1. Generate Blob from jsPDF
    let blob: Blob;
    try {
      const buffer = pdf.output('arraybuffer');
      blob = new Blob([buffer], { type: 'application/pdf' });
    } catch {
      blob = pdf.output('blob');
    }

    const blobUrl = URL.createObjectURL(blob);
    let dataUri = '';
    try {
      dataUri = pdf.output('datauristring');
    } catch {}

    // 2. Direct automatic download strictly without opening new tabs (_blank) or popups
    const link = document.createElement('a');
    link.style.position = 'fixed';
    link.style.left = '-9999px';
    link.style.top = '-9999px';
    link.style.opacity = '0';
    link.style.pointerEvents = 'none';
    link.href = blobUrl;
    link.download = cleanFilename;
    // CRITICAL: NEVER set link.target = '_blank'
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }, 1000);

    return {
      success: true,
      blobUrl,
      dataUri,
      filename: cleanFilename
    };
  } catch (err: any) {
    console.error('Fatal PDF export processing error:', err);
    return {
      success: false,
      blobUrl: '',
      dataUri: '',
      filename: cleanFilename,
      error: err?.message || 'Failed to process PDF output'
    };
  }
}
