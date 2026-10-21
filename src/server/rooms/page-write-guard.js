import { inspectPage } from './page-admission.js';

export class PageFormatError extends Error {
  constructor() {
    super('A converted page must retain one complete Yjs page value');
    this.name = 'PageFormatError';
    this.code = 'page-format';
    this.statusCode = 409;
  }
}

export function checkPageWriteFormat({ currentHtml, html, room = null }) {
  if (room?.pageTransition?.format !== 'yjs' && inspectPage(currentHtml ?? '').kind !== 'yjs') return;
  if (inspectPage(html ?? '').kind !== 'yjs') throw new PageFormatError();
}
