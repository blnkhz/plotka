import { describe, expect, it } from 'vitest';
import { commandKey, fileName, keyText } from '../src/renderer/src/lib/keys';

describe('keyText', () => {
  it('leaves the text alone on macOS', () => {
    expect(keyText('Save (⇧⌘S)', true)).toBe('Save (⇧⌘S)');
  });

  it('spells out shortcuts elsewhere', () => {
    expect(keyText('Open (⌘O)', false)).toBe('Open (Ctrl+O)');
    expect(keyText('⌘Z / ⇧⌘Z', false)).toBe('Ctrl+Z / Ctrl+Shift+Z');
    expect(keyText('Help (⌘?)', false)).toBe('Help (Ctrl+?)');
  });

  it('names a modifier on its own', () => {
    expect(keyText('⇧ free, ⌥ from center · ⌘ no snapping', false)).toBe(
      'Shift free, Alt from center · Ctrl no snapping',
    );
    expect(keyText('hold **⇧** to stretch, ⇧-click another', false)).toBe(
      'hold **Shift** to stretch, Shift-click another',
    );
  });
});

describe('commandKey', () => {
  it('is ⌘ on macOS and Ctrl elsewhere', () => {
    expect(commandKey({ metaKey: true, ctrlKey: false }, true)).toBe(true);
    expect(commandKey({ metaKey: false, ctrlKey: true }, true)).toBe(false);
    expect(commandKey({ metaKey: false, ctrlKey: true }, false)).toBe(true);
    expect(commandKey({ metaKey: true, ctrlKey: false }, false)).toBe(false);
  });
});

describe('fileName', () => {
  it('handles both kinds of slash', () => {
    expect(fileName('/Users/me/art.svg')).toBe('art.svg');
    expect(fileName('C:\\Users\\me\\art.svg')).toBe('art.svg');
    expect(fileName('art.svg')).toBe('art.svg');
  });
});
