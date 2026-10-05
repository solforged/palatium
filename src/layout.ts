import * as THREE from 'three';
import type { Palace } from './types';

/**
 * Floor plan: a foyer, then one hall per wing laid end to end along -z.
 * Loci alternate between the left and right walls; doorways sit on the
 * centre line. Each hall's partition wall (with doorway) is at `hall.zStart`.
 */
export const HALL_WIDTH = 14;
export const HALL_HEIGHT = 7;
export const DOOR_WIDTH = 3.2;
export const DOOR_HEIGHT = 4.2;
export const FOYER_DEPTH = 8;
export const EYE_HEIGHT = 1.7;
export const FRAME_SIZE = 3.4;
export const FRAME_Y = 3.9;

const SPACING = 5;
const MARGIN = 3.5;
const VIEW_DISTANCE = 6.4;
/** Aim a little below the frame centre so the painting isn't keystoned. */
const LOOK_DROP = 0.85;
const MIN_HALL_LENGTH = 12;

export interface Hall {
  wing: number;
  zStart: number;
  zEnd: number;
}

export interface Spot {
  /** -1: left wall, 1: right wall. */
  side: -1 | 1;
  /** Point on the wall face where the frame hangs. */
  wall: THREE.Vector3;
  /** Where the visitor stands to look at it. */
  stand: THREE.Vector3;
  /** Where the visitor looks from `stand`. */
  look: THREE.Vector3;
}

export interface Layout {
  halls: Hall[];
  spots: Spot[];
  /** Walking path: foyer start, doorways and stand points, in order. */
  path: THREE.Vector3[];
  /** Index into `path` for each spot. */
  spotPath: number[];
  endZ: number;
}

export function planLayout(palace: Palace): Layout {
  palace.loci.forEach((locus, i) => {
    const prev = palace.loci[i - 1];
    if (locus.wing < 0 || locus.wing >= palace.wings.length) {
      throw new Error(`Locus ${locus.id} points at missing wing ${locus.wing}`);
    }
    if (prev && locus.wing < prev.wing) {
      throw new Error(`Loci must be grouped by wing in order; ${locus.id} breaks the order`);
    }
  });

  const halls: Hall[] = [];
  const spots: Spot[] = [];
  const path = [new THREE.Vector3(0, EYE_HEIGHT, FOYER_DEPTH - 2)];
  const spotPath: number[] = [];
  let z = 0;

  palace.wings.forEach((_, wing) => {
    const zStart = z;
    path.push(new THREE.Vector3(0, EYE_HEIGHT, zStart));
    const members = palace.loci.filter((l) => l.wing === wing);
    members.forEach((_, j) => {
      const side: -1 | 1 = spots.length % 2 === 0 ? -1 : 1;
      const spotZ = zStart - MARGIN - j * SPACING;
      const wallX = (side * HALL_WIDTH) / 2;
      spots.push({
        side,
        wall: new THREE.Vector3(wallX, FRAME_Y, spotZ),
        stand: new THREE.Vector3(wallX - side * VIEW_DISTANCE, EYE_HEIGHT, spotZ),
        look: new THREE.Vector3(wallX, FRAME_Y - LOOK_DROP, spotZ),
      });
      spotPath.push(path.length);
      path.push(spots[spots.length - 1].stand);
    });
    const length = Math.max(MIN_HALL_LENGTH, MARGIN * 2 + Math.max(0, members.length - 1) * SPACING);
    z = zStart - length;
    halls.push({ wing, zStart, zEnd: z });
  });

  return { halls, spots, path, spotPath, endZ: z };
}
