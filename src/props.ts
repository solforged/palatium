import * as THREE from 'three';

/**
 * Furniture that makes each station a distinct place. Coordinates are in the
 * station's local frame: the wall face is z = 0, +z points into the room,
 * x runs along the wall, y = 0 is the floor. The painting hangs at x = 0, so
 * anything taller than ~2.1 m stands to the side.
 */

const materials = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: string, roughness = 0.6, metalness = 0, emissive?: string): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${emissive ?? ''}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (emissive) {
      m.emissive.set(emissive);
      m.emissiveIntensity = 1.4;
    }
    materials.set(key, m);
  }
  return m;
}

function box(g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

function cyl(g: THREE.Group, m: THREE.Material, rTop: number, rBottom: number, h: number, x: number, y: number, z: number, segments = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

const MARBLE = '#e8e2d6';
const WOOD = '#6b3f22';
const DARK_WOOD = '#3b2214';
const GOLD = '#d4a94a';
const VELVET = '#8e1b2b';

function fountain(g: THREE.Group): void {
  const marble = mat(MARBLE, 0.35);
  cyl(g, marble, 1.25, 1.35, 0.55, 0, 0.275, 1.8, 40);
  cyl(g, mat('#3aa6c9', 0.1, 0, '#0b4a63'), 1.1, 1.1, 0.04, 0, 0.53, 1.8, 40);
  cyl(g, marble, 0.14, 0.2, 0.9, 0, 0.75, 1.8);
  cyl(g, marble, 0.55, 0.2, 0.25, 0, 1.25, 1.8);
  cyl(g, mat('#7fd3ec', 0.1, 0, '#1f7ea3'), 0.05, 0.4, 0.45, 0, 1.55, 1.8);
}

function grandfatherClock(g: THREE.Group): void {
  const x = 3.4;
  box(g, mat(DARK_WOOD, 0.5), 0.75, 2.55, 0.45, x, 1.275, 0.3);
  box(g, mat(GOLD, 0.3, 0.6), 0.8, 0.12, 0.5, x, 2.6, 0.3);
  const face = cyl(g, mat('#f4ecd6', 0.4), 0.28, 0.28, 0.04, x, 2.1, 0.54, 32);
  face.rotation.x = Math.PI / 2;
  const pendulum = cyl(g, mat(GOLD, 0.3, 0.6), 0.12, 0.12, 0.03, x, 0.95, 0.54, 24);
  pendulum.rotation.x = Math.PI / 2;
  box(g, mat(GOLD, 0.3, 0.6), 0.03, 0.8, 0.03, x, 1.35, 0.54);
}

function armchair(g: THREE.Group): void {
  const velvet = mat(VELVET, 0.85);
  const wood = mat(WOOD, 0.5);
  box(g, velvet, 1.2, 0.45, 1.0, 0, 0.45, 1.9);
  box(g, velvet, 1.2, 1.0, 0.25, 0, 1.05, 1.45);
  box(g, velvet, 0.22, 0.35, 1.0, -0.65, 0.85, 1.9);
  box(g, velvet, 0.22, 0.35, 1.0, 0.65, 0.85, 1.9);
  for (const [x, z] of [[-0.5, 1.5], [0.5, 1.5], [-0.5, 2.3], [0.5, 2.3]]) {
    box(g, wood, 0.1, 0.25, 0.1, x, 0.12, z);
  }
}

function fireplace(g: THREE.Group): void {
  const stone = mat('#b9ad9b', 0.8);
  box(g, stone, 0.5, 1.7, 0.7, -1.35, 0.85, 0.35);
  box(g, stone, 0.5, 1.7, 0.7, 1.35, 0.85, 0.35);
  box(g, stone, 3.3, 0.35, 0.85, 0, 1.88, 0.42);
  box(g, mat('#141010', 0.9), 2.2, 1.7, 0.1, 0, 0.85, 0.06);
  box(g, mat('#2a1a10', 0.9), 1.4, 0.15, 0.5, 0, 0.08, 0.4);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 7), mat('#ff8a1f', 0.5, 0, '#ff5a00'));
  flame.position.set(0, 0.6, 0.4);
  g.add(flame);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 7), mat('#ffd45a', 0.5, 0, '#ffb000'));
  inner.position.set(0.15, 0.45, 0.5);
  g.add(inner);
}

function staircase(g: THREE.Group): void {
  const marble = mat(MARBLE, 0.4);
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const h = 0.28 * (i + 1);
    box(g, marble, 2.2, h, 0.42, 0, h / 2, 2.8 - i * 0.42);
  }
  for (const x of [-1.15, 1.15]) {
    const rail = box(g, mat(GOLD, 0.3, 0.6), 0.06, 0.06, 2.9, x, 1.75, 1.45);
    rail.rotation.x = Math.atan2(0.28 * steps, 0.42 * steps);
    cyl(g, mat(GOLD, 0.3, 0.6), 0.04, 0.04, 1.0, x, 0.78, 2.85, 12);
  }
}

function bathtub(g: THREE.Group): void {
  const enamel = mat('#f6f3ee', 0.25);
  box(g, enamel, 1.9, 0.6, 0.95, 0, 0.5, 1.6);
  box(g, mat('#57b8d6', 0.1, 0, '#0e5470'), 1.7, 0.02, 0.75, 0, 0.72, 1.6);
  const brass = mat(GOLD, 0.3, 0.6);
  for (const [x, z] of [[-0.8, 1.25], [0.8, 1.25], [-0.8, 1.95], [0.8, 1.95]]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), brass);
    foot.position.set(x, 0.11, z);
    g.add(foot);
  }
  cyl(g, brass, 0.04, 0.04, 0.5, -0.85, 1.0, 1.6, 12);
}

function grandPiano(g: THREE.Group): void {
  const lacquer = mat('#0d0d10', 0.2);
  box(g, lacquer, 1.55, 0.35, 1.9, 0, 0.92, 1.6);
  const lid = box(g, lacquer, 1.5, 0.04, 1.8, -0.35, 1.45, 1.6);
  lid.rotation.z = 0.6;
  box(g, mat('#f2efe6', 0.4), 1.4, 0.06, 0.22, 0, 0.92, 2.65);
  box(g, lacquer, 1.4, 0.05, 0.08, 0, 0.92, 2.74);
  for (const [x, z] of [[-0.65, 0.8], [0.65, 2.45], [-0.65, 2.45]]) {
    box(g, lacquer, 0.12, 0.75, 0.12, x, 0.37, z);
  }
  box(g, lacquer, 0.8, 0.45, 0.35, 0, 0.23, 3.25);
}

function throne(g: THREE.Group): void {
  const gold = mat(GOLD, 0.25, 0.7);
  const velvet = mat(VELVET, 0.85);
  box(g, gold, 1.0, 0.25, 0.4, 0, 0.12, 1.55);
  box(g, gold, 1.1, 0.5, 0.95, 0, 0.5, 1.15);
  box(g, velvet, 0.9, 0.12, 0.8, 0, 0.8, 1.15);
  box(g, gold, 1.1, 1.6, 0.18, 0, 1.4, 0.68);
  box(g, velvet, 0.8, 1.2, 0.04, 0, 1.4, 0.78);
  for (const x of [-0.5, 0.5]) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), gold);
    orb.position.set(x, 2.28, 0.68);
    g.add(orb);
    box(g, gold, 0.1, 0.35, 0.9, x, 1.0, 1.15);
  }
}

function bookshelf(g: THREE.Group): void {
  const x = 3.4;
  const wood = mat(WOOD, 0.6);
  box(g, wood, 1.5, 2.6, 0.45, x, 1.3, 0.25);
  const spines = ['#7a2e2e', '#2e4f7a', '#3f6b3a', '#b08a2e', '#5a2e6b', '#8a4a2a'];
  for (let shelf = 0; shelf < 4; shelf++) {
    let bx = x - 0.62;
    let k = shelf;
    while (bx < x + 0.6) {
      const w = 0.07 + ((k * 37) % 5) * 0.015;
      const h = 0.38 + ((k * 53) % 4) * 0.04;
      box(g, mat(spines[k % spines.length], 0.8), w, h, 0.32, bx + w / 2, 0.22 + shelf * 0.6 + h / 2, 0.42);
      bx += w + 0.01;
      k++;
    }
  }
}

function bed(g: THREE.Group): void {
  const wood = mat(DARK_WOOD, 0.5);
  box(g, wood, 1.8, 1.4, 0.12, 0, 0.7, 0.1);
  box(g, wood, 1.8, 0.4, 2.2, 0, 0.3, 1.25);
  box(g, mat('#f4f0e6', 0.9), 1.7, 0.2, 2.1, 0, 0.6, 1.25);
  box(g, mat('#3b5d8f', 0.9), 1.74, 0.12, 1.3, 0, 0.72, 1.7);
  box(g, mat('#ffffff', 0.9), 0.6, 0.15, 0.4, -0.45, 0.78, 0.4);
  box(g, mat('#ffffff', 0.9), 0.6, 0.15, 0.4, 0.45, 0.78, 0.4);
}

function globe(g: THREE.Group): void {
  const wood = mat(WOOD, 0.5);
  const brass = mat(GOLD, 0.3, 0.6);
  cyl(g, wood, 0.45, 0.55, 0.12, 0, 0.06, 1.8, 32);
  cyl(g, wood, 0.06, 0.09, 0.8, 0, 0.5, 1.8, 16);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), mat('#2c6fa8', 0.5));
  sphere.position.set(0, 1.4, 1.8);
  g.add(sphere);
  const land = new THREE.Mesh(new THREE.SphereGeometry(0.505, 9, 6, 0, 2.2, 0.7, 1.4), mat('#5f9e4a', 0.7));
  land.position.copy(sphere.position);
  g.add(land);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.025, 8, 48), brass);
  ring.position.copy(sphere.position);
  ring.rotation.set(0, Math.PI / 2, 0.41);
  g.add(ring);
}

function telescope(g: THREE.Group): void {
  const brass = mat(GOLD, 0.3, 0.6);
  const wood = mat(DARK_WOOD, 0.5);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(g, wood, 0.03, 0.04, 1.4, Math.cos(a) * 0.35, 0.65, 2.0 + Math.sin(a) * 0.35, 8);
    leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
  }
  const tube = cyl(g, brass, 0.09, 0.16, 1.6, 0, 1.55, 1.8, 20);
  tube.rotation.x = -1.0;
  tube.rotation.z = 0.15;
}

interface PropSpec {
  name: string;
  build: (g: THREE.Group) => void;
}

export const PROPS: PropSpec[] = [
  { name: 'the fountain', build: fountain },
  { name: 'the grandfather clock', build: grandfatherClock },
  { name: 'the armchair', build: armchair },
  { name: 'the fireplace', build: fireplace },
  { name: 'the staircase', build: staircase },
  { name: 'the bathtub', build: bathtub },
  { name: 'the grand piano', build: grandPiano },
  { name: 'the throne', build: throne },
  { name: 'the bookshelf', build: bookshelf },
  { name: 'the bed', build: bed },
  { name: 'the globe', build: globe },
  { name: 'the telescope', build: telescope },
];

/** Station `i` gets prop `i`; palaces longer than the prop list reuse props. */
export function propFor(i: number): PropSpec {
  return PROPS[i % PROPS.length];
}

export function buildProp(i: number): THREE.Group {
  const g = new THREE.Group();
  propFor(i).build(g);
  return g;
}
