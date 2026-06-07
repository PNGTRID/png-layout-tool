/**
 * Shared image cache module with LRU eviction.
 * Provides a single, centralised cache for HTMLImageElement instances
 * with explicit lifecycle management and bounded memory usage.
 */

/** Maximum cached images — prevents unbounded memory growth */
const MAX_CACHE_SIZE = 200;

const imageCache = new Map<string, HTMLImageElement>();

/** Load an image from objectUrl, using cache when available. Evicts oldest entry if cache is full. */
export async function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(objectUrl);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    // Move to end (most recently used) for LRU ordering
    imageCache.delete(objectUrl);
    imageCache.set(objectUrl, cached);
    return cached;
  }

  const img = new Image();
  img.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${objectUrl}`));
  });

  // Evict oldest entries if cache is at capacity
  while (imageCache.size >= MAX_CACHE_SIZE) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }

  imageCache.set(objectUrl, img);
  return img;
}

/** Remove a single entry from the cache (call when an image is deleted). */
export function evictImage(objectUrl: string): void {
  imageCache.delete(objectUrl);
}

/** Clear the entire cache (call on project reset / clearAll). */
export function clearImageCache(): void {
  imageCache.clear();
}

/** Get current cache size (useful for testing and diagnostics). */
export function getCacheSize(): number {
  return imageCache.size;
}
