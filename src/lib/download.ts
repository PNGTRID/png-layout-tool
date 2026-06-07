/**
 * Shared download utility — triggers a browser file download via Blob URL.
 * Used as fallback when Tauri fs is not available.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Delay revocation to allow the browser to start the download
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
