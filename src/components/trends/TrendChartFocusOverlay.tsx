/**
 * The keyboard-focus companion of the trend chart: a ring around the focused
 * point and a preview of its value and note. Recharts' tooltip follows only
 * the mouse. This overlay keeps its own state so focusing a point does not
 * re-render the chart, which would replace the focused point.
 */
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Box } from '@mantine/core';
import type { TrendDataPoint } from '@services/statistics/trendAnalysis';
import { CustomTooltip } from './TrendChartTooltip';

export interface FocusedPoint {
  x: number;
  y: number;
  radius: number;
  point: TrendDataPoint & { formattedDate: string };
}

export interface TrendChartFocusOverlayHandle {
  show: (focused: FocusedPoint) => void;
  hide: () => void;
}

export interface TrendChartFocusOverlayProps {
  ref: Ref<TrendChartFocusOverlayHandle>;
  notePreviews?: Record<number, string>;
}

export function TrendChartFocusOverlay({
  ref,
  notePreviews,
}: TrendChartFocusOverlayProps): React.ReactNode {
  const [focused, setFocused] = useState<(FocusedPoint & { openLeft: boolean }) | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      // Near the chart's right edge the preview opens to the left of the point
      show: (point) =>
        setFocused({
          ...point,
          openLeft: point.x > (boxRef.current?.parentElement?.clientWidth ?? 0) / 2,
        }),
      hide: () => setFocused(null),
    }),
    []
  );

  const ring = focused ? focused.radius + 8 : 0;

  return (
    <Box ref={boxRef} aria-hidden="true" style={{ pointerEvents: 'none' }}>
      {focused && (
        <>
          <Box
            data-focus-ring="true"
            style={{
              position: 'absolute',
              left: focused.x - ring,
              top: focused.y - ring,
              width: ring * 2,
              height: ring * 2,
              borderRadius: '50%',
              border: '2px solid #1c7ed6',
              zIndex: 2,
            }}
          />
          <Box
            data-focus-preview="true"
            style={{
              position: 'absolute',
              top: Math.max(0, focused.y - 20),
              left: focused.x + 16,
              transform: focused.openLeft ? 'translateX(calc(-100% - 32px))' : undefined,
              zIndex: 2,
            }}
          >
            <CustomTooltip
              active
              label={focused.point.formattedDate}
              payload={[{ payload: focused.point }]}
              notePreviews={notePreviews}
            />
          </Box>
        </>
      )}
    </Box>
  );
}
