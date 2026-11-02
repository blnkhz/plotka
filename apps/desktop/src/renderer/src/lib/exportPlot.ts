import { paperSize, toolpathToJson, toolpathToSvg } from '@plotter-studio/core';
import { useStore } from '../store';

/** PREVIEW-6: saves what will be plotted, as SVG or toolpath JSON. */
export async function exportPlot(kind: 'svg' | 'json') {
  const { processed, page, projectName, view } = useStore.getState();
  if (!processed) {
    useStore.setState({ error: 'Open a file first: there is nothing to export.' });
    return;
  }
  const layers = new Map(processed.clipped.layers.map((l) => [l.id, l]));
  const info = (id: string) => ({
    name: layers.get(id)?.name ?? id,
    color: layers.get(id)?.color ?? '#000000',
  });
  const paper = paperSize(page);
  const content =
    kind === 'svg'
      ? toolpathToSvg(processed.toolpath, paper, info, view.penWidth)
      : toolpathToJson(processed.toolpath, paper, info);
  const name = `${projectName || 'Plot'} (plotted).${kind === 'svg' ? 'svg' : 'json'}`;
  try {
    await window.api.invoke('file:saveText', name, content, [kind === 'svg' ? '.svg' : '.json']);
  } catch (e) {
    useStore.setState({ error: `Couldn't export: ${e instanceof Error ? e.message : String(e)}` });
  }
}
