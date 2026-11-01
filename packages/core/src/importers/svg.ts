import { importSvg } from '../svg/import';
import { decodeUtf8 } from '../svg/utf8';
import type { Importer } from './types';

export const svgImporter: Importer = {
  id: 'svg',
  label: 'SVG',
  extensions: ['.svg'],
  canImport(bytes, filename) {
    if (filename.toLowerCase().endsWith('.svg')) return true;
    const head = decodeUtf8(bytes.subarray(0, 1024));
    return /<svg[\s>]/.test(head);
  },
  async import(bytes, _filename, opts) {
    return importSvg(decodeUtf8(bytes), opts);
  },
};
