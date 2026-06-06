import { useState, useMemo, useCallback, useRef } from 'react';
import { LayoutParams, LayoutResult, UploadedImage } from '../shared/types';
import { calculateLayout } from '../lib/layout-engine';

const DEFAULT_PARAMS: LayoutParams = {
  gap: 2,              // cm
  canvasWidthCm: 57,    // cm
  canvasHeightCm: 0,    // 0 = auto
  dpi: 300,
  autoRotate: false,
  backgroundColor: null,
  alignMode: 'center',
};

export function useLayout(images: UploadedImage[]) {
  const [params, setParams] = useState<LayoutParams>(DEFAULT_PARAMS);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const layout: LayoutResult = useMemo(() => {
    // layoutVersion forces recalculation when relayout is triggered
    void layoutVersion;
    return calculateLayout(images, params);
  }, [images, params, layoutVersion]);

  const updateParam = useCallback(<K extends keyof LayoutParams>(
    key: K,
    value: LayoutParams[K]
  ) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const relayout = useCallback(() => {
    setLayoutVersion(v => v + 1);
  }, []);

  return { params, layout, updateParam, relayout };
}
