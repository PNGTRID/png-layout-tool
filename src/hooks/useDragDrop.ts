import { useState, useCallback, useEffect, useRef } from 'react';

interface UseDragDropOptions {
  onFilesDropped: (files: File[]) => void;
}

function isImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'image/png' || name.endsWith('.png') || name.endsWith('.psd');
}

const MAX_DIRECTORY_DEPTH = 10;

async function traverseEntry(
  entry: FileSystemEntry,
  files: File[],
  depth: number = 0
): Promise<void> {
  // Guard against excessively deep or cyclic directory structures
  if (depth > MAX_DIRECTORY_DEPTH) return;

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file((file) => {
        if (isImageFile(file)) {
          files.push(file);
        }
        resolve();
      }, () => resolve());
    });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    return new Promise((resolve) => {
      const reader = dirEntry.createReader();
      const readEntries = async () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve();
            return;
          }
          for (const childEntry of entries) {
            await traverseEntry(childEntry, files, depth + 1);
          }
          // Continue reading (directories may be batched)
          readEntries();
        }, () => resolve());
      };
      readEntries();
    });
  }
}

export function useDragDrop({ onFilesDropped }: UseDragDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const dt = e.dataTransfer;
    if (!dt) return;

    const files: File[] = [];
    const promises: Promise<void>[] = [];

    // Try webkitGetAsEntry for directory support
    if (dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            promises.push(traverseEntry(entry, files));
          } else {
            // Fallback: use getAsFile
            const file = item.getAsFile();
            if (file && isImageFile(file)) {
              files.push(file);
            }
          }
        }
      }

      Promise.all(promises).then(() => {
        if (files.length > 0) {
          onFilesDropped(files);
        }
      });
    } else if (dt.files && dt.files.length > 0) {
      // Fallback for browsers without webkitGetAsEntry
      const pngFiles = Array.from(dt.files).filter(isImageFile);
      if (pngFiles.length > 0) {
        onFilesDropped(pngFiles);
      }
    }
  }, [onFilesDropped]);

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return { isDragging };
}
