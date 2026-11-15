import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@xterm/xterm', () => ({ Terminal: class {} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));

import { App } from './App';

it('starts with a framed terminal surface and no application chrome', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('terminal-window');
  expect(html).toContain('<h1>Shellcraft</h1>');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<nav');
  expect(html).not.toContain('<footer');
  expect(html).not.toContain('Mission board');
  expect(html).not.toContain('token-balance');
  expect(html).not.toContain('statusbar');
});
