import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { useEffect, useRef } from 'react';

/**
 * Alternate scroll mode: in the alternate screen the terminal turns wheel / two-finger
 * scrolling into ↑/↓ keys. Unlike mouse reporting it leaves click+drag to the terminal,
 * so text can still be selected and copied.
 */
export const MOUSE_ON = '\u001b[?1007h\u001b[?1004h';
export const MOUSE_OFF = '\u001b[?1004l\u001b[?1007l';

const ESC = '\u001b';
const SGR = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
const SGR_PARTIAL = /^\u001b\[<[\d;]*$/;
/** How long an incomplete sequence at the end of a chunk is held back. */
const PENDING_MS = 30;

/** -1 = wheel up, +1 = wheel down, null = anything else (clicks, horizontal scroll …) */
function wheelOf(button: number): -1 | 1 | null {
  if (!(button & 64) || button & 128) return null;
  const low = button & 3;
  return low === 0 ? -1 : low === 1 ? 1 : null;
}

export interface Extracted {
  text: string;
  events: (-1 | 1)[];
  pending: string;
  /** Focus reports (`ESC[I` / `ESC[O`) in order; only present when there were any. */
  focus?: boolean[];
}

/**
 * Pulls mouse sequences out of raw terminal input. Supports SGR (`ESC[<b;x;yM`) and
 * the older X10 encoding (`ESC[M` + 3 bytes). Everything else passes through untouched;
 * an incomplete sequence at the very end is returned as `pending`.
 */
export function extractMouse(input: string, pending = ''): Extracted {
  const s = pending + input;
  const events: (-1 | 1)[] = [];
  const focus: boolean[] = [];
  let text = '';
  let i = 0;
  while (i < s.length) {
    const esc = s.indexOf(ESC, i);
    if (esc === -1) {
      text += s.slice(i);
      break;
    }
    text += s.slice(i, esc);
    const rest = s.slice(esc);

    if (rest.startsWith(`${ESC}[I`) || rest.startsWith(`${ESC}[O`)) {
      focus.push(rest[2] === 'I');
      i = esc + 3;
      continue;
    }

    const sgr = SGR.exec(rest);
    if (sgr) {
      const dir = sgr[4] === 'M' ? wheelOf(Number(sgr[1])) : null;
      if (dir) events.push(dir);
      i = esc + sgr[0].length;
      continue;
    }
    if (rest.startsWith(`${ESC}[M`)) {
      if (rest.length < 6) return done(text, events, rest, focus);
      const dir = wheelOf(rest.charCodeAt(3) - 32);
      if (dir) events.push(dir);
      i = esc + 6;
      continue;
    }
    // could still become a mouse sequence once the next chunk arrives
    if (rest === ESC || rest === `${ESC}[` || SGR_PARTIAL.test(rest)) return done(text, events, rest, focus);

    text += ESC;
    i = esc + 1;
  }
  return done(text, events, '', focus);
}

function done(text: string, events: (-1 | 1)[], pending: string, focus: boolean[]): Extracted {
  return focus.length ? { text, events, pending, focus } : { text, events, pending };
}

/** Wheel events from the terminal, emitted outside of Ink. */
export const mouse = new EventEmitter<{ wheel: [-1 | 1]; focus: [boolean] }>();

/**
 * Stands in for `process.stdin` towards Ink: mouse sequences are filtered out and
 * emitted as wheel events, everything else is passed on unchanged. Raw mode and
 * ref/unref are forwarded to the real stdin.
 */
export class MouseFilterStdin extends PassThrough {
  readonly isTTY = true;
  private pending = '';
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly source: NodeJS.ReadStream) {
    super();
    source.setEncoding('utf8');
    source.on('data', (chunk: string) => this.feed(chunk));
  }

  private feed(chunk: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = extractMouse(chunk, this.pending);
    this.pending = r.pending;
    for (const e of r.events) mouse.emit('wheel', e);
    for (const f of r.focus ?? []) mouse.emit('focus', f);
    if (r.text) this.write(r.text);
    if (this.pending) {
      this.timer = setTimeout(() => {
        const p = this.pending;
        this.pending = '';
        if (p) this.write(p);
      }, PENDING_MS);
    }
  }

  setRawMode(mode: boolean): this {
    this.source.setRawMode(mode);
    return this;
  }

  ref(): this {
    this.source.ref();
    return this;
  }

  unref(): this {
    this.source.unref();
    return this;
  }
}

/** Calls `cb(-1 | 1)` for every wheel tick while `isActive`. */
export function useWheel(cb: (dir: -1 | 1) => void, isActive = true): void {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!isActive) return;
    const on = (dir: -1 | 1) => latest.current(dir);
    mouse.on('wheel', on);
    return () => {
      mouse.off('wheel', on);
    };
  }, [isActive]);
}
