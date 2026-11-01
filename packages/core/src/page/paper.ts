export type PaperPreset = { id: string; label: string; width: number; height: number };

const IN = 25.4;

/** Portrait dimensions in mm. */
export const PAPER_PRESETS: readonly PaperPreset[] = [
  { id: 'a5', label: 'A5', width: 148, height: 210 },
  { id: 'a4', label: 'A4', width: 210, height: 297 },
  { id: 'a3', label: 'A3', width: 297, height: 420 },
  { id: 'letter', label: 'Letter', width: 8.5 * IN, height: 11 * IN },
  { id: 'legal', label: 'Legal', width: 8.5 * IN, height: 14 * IN },
  { id: 'tabloid', label: 'Tabloid (11x17 in)', width: 11 * IN, height: 17 * IN },
  { id: '9x12', label: '9x12 in', width: 9 * IN, height: 12 * IN },
  { id: '5x7', label: '5x7 in', width: 5 * IN, height: 7 * IN },
  { id: '6x6', label: '6x6 in', width: 6 * IN, height: 6 * IN },
];

export type Orientation = 'portrait' | 'landscape';

/** 9-point anchor, or 'file' to keep the artwork where the file's artboard puts it. */
export type Alignment =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
  | 'file';

export type FitMode =
  /** 100% of the file's size. */
  | 'original'
  /** Scale so the artwork fits inside the margins. */
  | 'fit'
  /** Scale so the artwork covers the margins, cropping the overflow. */
  | 'fill';

export type Margins = { top: number; right: number; bottom: number; left: number };

export type PageSetup = {
  /** Preset id, or 'custom'. */
  paper: string;
  /** Portrait width/height in mm. Used when paper is 'custom'. */
  customWidth: number;
  customHeight: number;
  /** Unit shown for custom size inputs. Values are always stored in mm. */
  customUnit: 'mm' | 'in';
  orientation: Orientation;
  margins: Margins;
  fit: FitMode;
  align: Alignment;
  /** Extra scale in %, applied after the fit mode. */
  scale: number;
  /** Degrees clockwise, applied around the artwork center before fitting. */
  rotation: number;
  /** mm, applied last. */
  offsetX: number;
  offsetY: number;
};

export const defaultPageSetup = (): PageSetup => ({
  paper: 'a4',
  customWidth: 210,
  customHeight: 297,
  customUnit: 'mm',
  orientation: 'portrait',
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  fit: 'fit',
  align: 'center',
  scale: 100,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
});

export type Rect = { x: number; y: number; width: number; height: number };

/** Paper size in mm after orientation. */
export function paperSize(page: PageSetup): { width: number; height: number } {
  const preset = PAPER_PRESETS.find((p) => p.id === page.paper);
  const w = preset ? preset.width : page.customWidth;
  const h = preset ? preset.height : page.customHeight;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  return page.orientation === 'landscape'
    ? { width: long, height: short }
    : { width: short, height: long };
}

/** The area inside the margins, in paper coordinates. */
export function marginBox(page: PageSetup): Rect {
  const { width, height } = paperSize(page);
  const m = page.margins;
  return {
    x: m.left,
    y: m.top,
    width: Math.max(0, width - m.left - m.right),
    height: Math.max(0, height - m.top - m.bottom),
  };
}
