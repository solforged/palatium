import * as THREE from 'three';
import type { Palace } from './types';
import {
  DOOR_HEIGHT, DOOR_WIDTH, FOYER_DEPTH, FRAME_SIZE, FRAME_Y, HALL_HEIGHT, HALL_WIDTH,
  type Layout,
} from './layout';
import { buildProp } from './props';
import { CanvasLabel, fitText, roman } from './text';

/** Axis-aligned obstacle footprint on the floor plane. */
export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Station {
  /** 0 = closed, 1 = open. Animated towards `curtainTarget`. */
  curtain: number;
  curtainTarget: number;
  setLabel(revealed: boolean): void;
}

export interface World {
  stations: Station[];
  colliders: Collider[];
  update(dt: number): void;
}

const WALL_THICKNESS = 0.5;
const WALL_LIGHTNESS = 0.17;
const FOYER_COLOR = '#6d6158';

function shade(hex: string, lightness: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s * 0.55, lightness);
}

function floorTexture(color: string): THREE.CanvasTexture {
  const label = new CanvasLabel(256, 256);
  const dark = `#${shade(color, 0.22).getHexString()}`;
  label.draw((ctx, w, h) => {
    ctx.fillStyle = '#d9d0bf';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, w / 2, h / 2);
    ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
  });
  label.texture.wrapS = label.texture.wrapT = THREE.RepeatWrapping;
  return label.texture;
}

function curtainTexture(): THREE.CanvasTexture {
  const label = new CanvasLabel(256, 64);
  label.draw((ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    const folds = 9;
    for (let i = 0; i <= folds * 2; i++) {
      grad.addColorStop(i / (folds * 2), i % 2 === 0 ? '#5a0d18' : '#b3243a');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  return label.texture;
}

export function buildWorld(
  scene: THREE.Scene,
  palace: Palace,
  layout: Layout,
  imageBase: string,
): World {
  const colliders: Collider[] = [];
  const stations: Station[] = [];
  const curtainMeshes: THREE.Object3D[] = [];
  const loader = new THREE.TextureLoader();

  const addBox = (
    material: THREE.Material,
    size: [number, number, number],
    pos: [number, number, number],
    solid = true,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...pos);
    scene.add(mesh);
    if (solid) {
      colliders.push({
        minX: pos[0] - size[0] / 2,
        maxX: pos[0] + size[0] / 2,
        minZ: pos[2] - size[2] / 2,
        maxZ: pos[2] + size[2] / 2,
      });
    }
    return mesh;
  };

  /** Floor, ceiling and side walls for a stretch of corridor from zStart down to zEnd. */
  const addRoom = (zStart: number, zEnd: number, color: string, floorTex: THREE.Texture) => {
    const length = zStart - zEnd;
    const midZ = (zStart + zEnd) / 2;
    const wallMat = new THREE.MeshStandardMaterial({ color: shade(color, WALL_LIGHTNESS), roughness: 0.9 });
    const tex = floorTex.clone();
    tex.repeat.set(HALL_WIDTH / 2, length / 2);
    tex.needsUpdate = true;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL_WIDTH, length),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, midZ);
    scene.add(floor);
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL_WIDTH, length),
      new THREE.MeshStandardMaterial({ color: shade(color, 0.16), roughness: 1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, HALL_HEIGHT, midZ);
    scene.add(ceiling);
    for (const side of [-1, 1]) {
      addBox(wallMat, [WALL_THICKNESS, HALL_HEIGHT, length], [side * (HALL_WIDTH + WALL_THICKNESS) / 2, HALL_HEIGHT / 2, midZ]);
    }
    // Cornice along both walls.
    const trim = new THREE.MeshStandardMaterial({ color: '#d8c79a', roughness: 0.5, metalness: 0.2 });
    for (const side of [-1, 1]) {
      addBox(trim, [0.3, 0.25, length], [side * (HALL_WIDTH / 2 - 0.15), HALL_HEIGHT - 0.15, midZ], false);
      addBox(trim, [0.12, 0.3, length], [side * (HALL_WIDTH / 2 - 0.06), 0.15, midZ], false);
    }
    return wallMat;
  };

  /** Cross wall at z with a centred doorway. */
  const addPartition = (z: number, material: THREE.Material) => {
    const piece = (HALL_WIDTH - DOOR_WIDTH) / 2;
    for (const side of [-1, 1]) {
      addBox(material, [piece, HALL_HEIGHT, WALL_THICKNESS], [side * (DOOR_WIDTH + piece) / 2, HALL_HEIGHT / 2, z]);
    }
    addBox(material, [DOOR_WIDTH, HALL_HEIGHT - DOOR_HEIGHT, WALL_THICKNESS], [0, (HALL_HEIGHT + DOOR_HEIGHT) / 2, z], false);
  };

  const addSign = (
    z: number,
    facing: 1 | -1,
    y: number,
    lines: { text: string; size: number; color: string; weight?: string }[],
    width = 7,
  ) => {
    const height = width * (288 / 1024);
    const label = new CanvasLabel(1024, 288);
    label.draw((ctx, w, h) => {
      ctx.fillStyle = 'rgba(20, 14, 10, 0.86)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d4a94a';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const total = lines.reduce((sum, l) => sum + l.size * 1.25, 0);
      let cy = h / 2 - total / 2;
      for (const line of lines) {
        cy += (line.size * 1.25) / 2;
        ctx.fillStyle = line.color;
        fitText(ctx, line.text, w / 2, cy, w - 80, line.size, line.weight);
        cy += (line.size * 1.25) / 2;
      }
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, toneMapped: false }),
    );
    sign.position.set(0, y, z + facing * (WALL_THICKNESS / 2 + 0.02));
    if (facing === -1) sign.rotation.y = Math.PI;
    scene.add(sign);
  };

  // Foyer.
  const foyerFloor = floorTexture(FOYER_COLOR);
  const foyerWall = addRoom(FOYER_DEPTH, 0, FOYER_COLOR, foyerFloor);
  addBox(foyerWall, [HALL_WIDTH, HALL_HEIGHT, WALL_THICKNESS], [0, HALL_HEIGHT / 2, FOYER_DEPTH + WALL_THICKNESS / 2]);
  addSign(FOYER_DEPTH + WALL_THICKNESS / 2, -1, 4.2, [
    { text: palace.title, size: 84, color: '#f3e3b5' },
    { text: palace.subject, size: 40, color: '#d9c9a6', weight: '400' },
  ], 9);
  const foyerLight = new THREE.PointLight('#ffe2b0', 25, 0, 1.6);
  foyerLight.position.set(0, HALL_HEIGHT - 1, FOYER_DEPTH / 2);
  scene.add(foyerLight);

  // Halls.
  for (const hall of layout.halls) {
    const wing = palace.wings[hall.wing];
    const wallMat = addRoom(hall.zStart, hall.zEnd, wing.color, floorTexture(wing.color));
    addPartition(hall.zStart, wallMat);
    addSign(hall.zStart, 1, (HALL_HEIGHT + DOOR_HEIGHT) / 2, [
      { text: wing.name.toUpperCase(), size: 110, color: '#f3e3b5' },
      { text: `${wing.gloss}  ·  ${wing.dates}`, size: 46, color: '#d9c9a6', weight: '400' },
    ]);
    const lightCount = Math.max(1, Math.round((hall.zStart - hall.zEnd) / 10));
    for (let i = 0; i < lightCount; i++) {
      const light = new THREE.PointLight(shade(wing.color, 0.75), 18, 0, 1.5);
      const z = hall.zStart - ((i + 0.5) * (hall.zStart - hall.zEnd)) / lightCount;
      light.position.set(0, HALL_HEIGHT - 0.8, z);
      scene.add(light);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 10),
        new THREE.MeshBasicMaterial({ color: '#fff3d6' }),
      );
      lamp.position.copy(light.position);
      scene.add(lamp);
    }
  }
  const lastHall = layout.halls[layout.halls.length - 1];
  const endMat = new THREE.MeshStandardMaterial({
    color: shade(palace.wings[lastHall.wing].color, WALL_LIGHTNESS),
    roughness: 0.9,
  });
  addBox(endMat, [HALL_WIDTH, HALL_HEIGHT, WALL_THICKNESS], [0, HALL_HEIGHT / 2, layout.endZ - WALL_THICKNESS / 2]);
  addSign(layout.endZ - WALL_THICKNESS / 2, 1, 4.2, [
    { text: 'You have reached the present', size: 64, color: '#f3e3b5' },
    { text: 'Turn around and walk it back in your head', size: 40, color: '#d9c9a6', weight: '400' },
  ], 8);

  // Stations.
  const frameMat = new THREE.MeshStandardMaterial({ color: '#c99a3c', roughness: 0.3, metalness: 0.75 });
  const pilasterMat = new THREE.MeshStandardMaterial({ color: '#e9e1d0', roughness: 0.5 });
  const curtainMat = new THREE.MeshStandardMaterial({ map: curtainTexture(), roughness: 0.9, side: THREE.DoubleSide });
  const valanceMat = new THREE.MeshStandardMaterial({ color: '#6e1220', roughness: 0.8 });
  const inward = new THREE.Vector3();

  layout.spots.forEach((spot, i) => {
    const locus = palace.loci[i];
    const group = new THREE.Group();
    group.position.set(spot.wall.x, 0, spot.wall.z);
    group.rotation.y = (-spot.side * Math.PI) / 2;
    scene.add(group);

    const texture = loader.load(imageBase + locus.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const painting = new THREE.Mesh(
      new THREE.PlaneGeometry(FRAME_SIZE, FRAME_SIZE),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    painting.position.set(0, FRAME_Y, 0.1);
    group.add(painting);

    const half = FRAME_SIZE / 2;
    const bar = 0.22;
    for (const [w, h, x, y] of [
      [FRAME_SIZE + bar * 2, bar, 0, FRAME_Y + half + bar / 2],
      [FRAME_SIZE + bar * 2, bar, 0, FRAME_Y - half - bar / 2],
      [bar, FRAME_SIZE, -half - bar / 2, FRAME_Y],
      [bar, FRAME_SIZE, half + bar / 2, FRAME_Y],
    ]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), frameMat);
      piece.position.set(x, y, 0.09);
      group.add(piece);
    }
    for (const x of [-2.4, 2.4]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.45, HALL_HEIGHT - 0.6, 0.25), pilasterMat);
      pilaster.position.set(x, (HALL_HEIGHT - 0.6) / 2, 0.12);
      group.add(pilaster);
    }

    // Curtain hangs from a pivot at the top of the frame and shrinks upwards to open.
    const curtainPivot = new THREE.Group();
    curtainPivot.position.set(0, FRAME_Y + half + bar, 0.3);
    const curtainHeight = FRAME_SIZE + bar * 2;
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_SIZE + bar * 2 + 0.2, curtainHeight), curtainMat);
    curtain.position.y = -curtainHeight / 2;
    curtainPivot.add(curtain);
    group.add(curtainPivot);
    curtainMeshes.push(curtainPivot);
    const valance = new THREE.Mesh(new THREE.BoxGeometry(FRAME_SIZE + bar * 2 + 0.5, 0.35, 0.3), valanceMat);
    valance.position.set(0, FRAME_Y + half + bar + 0.1, 0.3);
    group.add(valance);

    const plaque = new CanvasLabel(768, 128);
    const plaqueMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 0.5),
      new THREE.MeshBasicMaterial({ map: plaque.texture, transparent: true, toneMapped: false }),
    );
    plaqueMesh.position.set(0, FRAME_Y + half + 0.7, 0.5);
    group.add(plaqueMesh);

    const prop = buildProp(i);
    group.add(prop);

    const spotlight = new THREE.SpotLight('#fff1d2', 30, 0, 0.55, 0.6, 1.2);
    spotlight.position.set(0, HALL_HEIGHT - 0.3, 3.2);
    spotlight.target.position.set(0, FRAME_Y - 1, 0);
    group.add(spotlight, spotlight.target);

    // Floor marker with the station number, on the walking path.
    const marker = new CanvasLabel(128, 128);
    marker.draw((ctx, w, h) => {
      ctx.fillStyle = 'rgba(212, 169, 74, 0.9)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20150c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitText(ctx, roman(i + 1), w / 2, h / 2 + 4, w - 30, 64, '700');
    });
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 32),
      new THREE.MeshBasicMaterial({ map: marker.texture, transparent: true, toneMapped: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    inward.set(-spot.side, 0, 0);
    disc.position.set(spot.stand.x, 0.02, spot.stand.z).addScaledVector(inward, -1.2);
    disc.rotation.z = (-spot.side * Math.PI) / 2;
    scene.add(disc);

    // Props block the visitor in free-roam mode.
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(prop);
    colliders.push({ minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z });

    const station: Station = {
      curtain: 1,
      curtainTarget: 1,
      setLabel(revealed: boolean) {
        plaque.draw((ctx, w, h) => {
          ctx.fillStyle = 'rgba(20, 14, 10, 0.85)';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = '#d4a94a';
          ctx.lineWidth = 4;
          ctx.strokeRect(6, 6, w - 12, h - 12);
          ctx.fillStyle = '#f3e3b5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const text = revealed ? `${roman(i + 1)}  ·  ${locus.answer}` : `${roman(i + 1)}  ·  ?`;
          fitText(ctx, text, w / 2, h / 2 + 4, w - 40, 64);
        });
      },
    };
    station.setLabel(true);
    stations.push(station);
  });

  // Glowing route along the floor.
  const route = new THREE.CatmullRomCurve3(
    layout.path.map((p) => new THREE.Vector3(p.x, 0.03, p.z)),
    false,
    'centripetal',
  );
  const ribbon = new THREE.Mesh(
    new THREE.TubeGeometry(route, layout.path.length * 24, 0.05, 6),
    new THREE.MeshBasicMaterial({ color: '#f0c25e', toneMapped: false }),
  );
  scene.add(ribbon);

  scene.add(new THREE.HemisphereLight('#fff4e0', '#2a1d14', 0.35));
  scene.fog = new THREE.Fog('#120d0a', 18, 70);
  scene.background = new THREE.Color('#120d0a');

  return {
    stations,
    colliders,
    update(dt: number) {
      stations.forEach((station, i) => {
        const delta = station.curtainTarget - station.curtain;
        station.curtain += Math.sign(delta) * Math.min(Math.abs(delta), dt * 1.4);
        const pivot = curtainMeshes[i];
        pivot.scale.y = Math.max(0.001, 1 - station.curtain);
        pivot.visible = station.curtain < 0.999;
      });
    },
  };
}
