import * as THREE from 'three';

export const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

const NUMERALS: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function roman(n: number): string {
  let out = '';
  for (const [value, glyph] of NUMERALS) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

/** A canvas-backed texture that can be redrawn in place. */
export class CanvasLabel {
  readonly texture: THREE.CanvasTexture;
  readonly ctx: CanvasRenderingContext2D;

  constructor(readonly width: number, readonly height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.ctx = canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  draw(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    paint(this.ctx, this.width, this.height);
    this.texture.needsUpdate = true;
  }
}

/** Shrinks the font until `text` fits in `maxWidth`. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  weight = '600',
): void {
  let px = size;
  ctx.font = `${weight} ${px}px ${SERIF}`;
  while (px > 8 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${SERIF}`;
  }
  ctx.fillText(text, x, y);
}
