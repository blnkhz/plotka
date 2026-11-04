import { useEffect, useRef } from 'react';
import { isNibFont, layoutText, type TextItem } from '@plotka/core';
import { addNibPath, type Nib } from '../lib/nib';
import styles from './NibTextPreview.module.css';

/** Tallest the preview gets, px; longer text is drawn smaller to fit. */
const MAX_HEIGHT = 180;

/**
 * The text as the parallel pen draws it: its strokes swept by a nib this wide, at this angle, at
 * the text's real size scaled to fit the panel. A bar under it shows the nib's own width.
 */
export function NibTextPreview({ item, nib, color }: { item: TextItem; nib: Nib; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const t = layoutText(item.text || ' ', {
        font: isNibFont(item.font) ? item.font : 'blackletter',
        size: item.size,
        lineSpacing: item.lineSpacing,
        letterSpacing: item.letterSpacing,
        align: item.align,
      });
      // Ink reaches half a nib past the strokes' middles; swashes go above the capitals and
      // descenders below the last line.
      const pad = nib.width * 1.5;
      const above = item.size * 0.2;
      const w = t.width + pad * 2;
      const h = t.height + above + item.size * 0.55 + pad * 2;
      // The paper's padding is 6 px a side.
      const cssW = Math.max(40, (canvas.parentElement?.clientWidth ?? 252) - 12);
      const scale = Math.min(cssW / w, MAX_HEIGHT / h);
      const cssH = Math.max(24, Math.ceil(h * scale));
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.translate((cssW - w * scale) / 2, 0);
      ctx.scale(scale, scale);
      ctx.translate(pad, pad + above);
      const path = new Path2D();
      for (const line of t.lines) addNibPath(path, line.points, line.closed, nib);
      ctx.fillStyle = color;
      ctx.fill(path, 'nonzero');
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [item, nib, color]);

  return (
    <div className={styles.paper}>
      <canvas ref={ref} aria-label="Text drawn with the parallel pen" role="img" />
    </div>
  );
}
