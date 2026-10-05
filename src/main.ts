import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { planLayout } from './layout';
import { propFor } from './props';
import { describeDue, loadReview, recordWalk, type ReviewState } from './review';
import './style.css';
import { roman } from './text';
import type { Palace } from './types';
import { buildWorld } from './world';

type Mode = 'menu' | 'learn' | 'recall' | 'roam' | 'summary';

const PLAYER_RADIUS = 0.35;
const WALK_SPEED = 4;
const RUN_SPEED = 8;
const TURN_SPEED = 2;
const ROAM_RANGE = 8;
const UP = new THREE.Vector3(0, 1, 0);

const HINTS: Record<Mode, string> = {
  menu: '',
  summary: '',
  learn: '← → walk  ·  Esc menu',
  recall: 'Space reveal  ·  1 remembered  ·  2 forgot  ·  Esc menu',
  roam: 'Click to look  ·  WASD or arrows move  ·  Shift run  ·  Esc menu',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function main(): Promise<void> {
  const palaceId = new URLSearchParams(location.search).get('palace') ?? 'geologic-time';
  const base = `${import.meta.env.BASE_URL}palaces/${palaceId}/`;
  const response = await fetch(`${base}palace.json`);
  if (!response.ok) throw new Error(`No palace called "${palaceId}" (HTTP ${response.status}).`);
  const palace = (await response.json()) as Palace;
  document.title = `${palace.title} · Palatium`;
  const layout = planLayout(palace);
  const count = palace.loci.length;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 200);
  const world = buildWorld(scene, palace, layout, base);
  const controls = new PointerLockControls(camera, renderer.domElement);

  const curve = new THREE.CatmullRomCurve3(layout.path, false, 'centripetal');
  const lookMatrix = new THREE.Matrix4();
  const viewFrom = (eye: THREE.Vector3, target: THREE.Vector3) =>
    new THREE.Quaternion().setFromRotationMatrix(lookMatrix.lookAt(eye, target, UP));
  const stationViews = layout.spots.map((spot) => viewFrom(spot.stand, spot.look));
  const startView = viewFrom(layout.path[0], new THREE.Vector3(0, 3.6, 0));
  // CatmullRomCurve3 maps control point k to t = k / (n - 1).
  const spotT = layout.spotPath.map((k) => k / (layout.path.length - 1));

  let mode: Mode = 'menu';
  let index = 0;
  let revealed = false;
  let roamIndex = -1;
  let pathPos = 0;
  const results: boolean[] = [];
  let travel: {
    from: number;
    to: number;
    q0: THREE.Quaternion;
    q1: THREE.Quaternion;
    t: number;
    duration: number;
  } | null = null;
  const keys = new Set<string>();

  function placeAtStart(): void {
    travel = null;
    pathPos = 0;
    camera.position.copy(layout.path[0]);
    camera.quaternion.copy(startView);
  }

  function setCurtains(open: boolean, instant: boolean): void {
    for (const station of world.stations) {
      station.curtainTarget = open ? 1 : 0;
      if (instant) station.curtain = station.curtainTarget;
      station.setLabel(open);
    }
  }

  function setMode(next: Mode): void {
    mode = next;
    keys.clear();
    $('menu').hidden = next !== 'menu';
    $('summary').hidden = next !== 'summary';
    $('hint').hidden = HINTS[next] === '';
    $('hint').textContent = HINTS[next];
    renderPanel();
  }

  function renderMenu(review: ReviewState): void {
    $('menu-title').textContent = palace.title;
    $('menu-subject').textContent = palace.subject;
    $('menu-prompt').textContent = `“${palace.prompt}”`;
    $('menu-wings').innerHTML = palace.wings
      .map((wing, w) => {
        const rooms = palace.loci.filter((l) => l.wing === w).length;
        return `<li><b>${escapeHtml(wing.name)}</b> <span>${escapeHtml(wing.gloss)} · ${escapeHtml(wing.dates)} · ${rooms} stations</span></li>`;
      })
      .join('');
    const last = review.walks.at(-1);
    const lastText = last ? ` Last walk: ${last.correct} of ${last.total}.` : '';
    $('menu-review').textContent = describeDue(review) + lastText;
  }

  function goMenu(): void {
    if (controls.isLocked) controls.unlock();
    placeAtStart();
    setCurtains(true, true);
    renderMenu(loadReview(palace.id));
    setMode('menu');
  }

  function walkTo(i: number): void {
    index = i;
    revealed = false;
    const hops = Math.abs(spotT[i] - pathPos) * (layout.path.length - 1);
    travel = {
      from: pathPos,
      to: spotT[i],
      q0: camera.quaternion.clone(),
      q1: stationViews[i],
      t: 0,
      duration: THREE.MathUtils.clamp(0.7 + hops * 0.55, 1, 5),
    };
    renderPanel();
  }

  function startGuided(next: 'learn' | 'recall'): void {
    results.length = 0;
    setCurtains(next === 'learn', true);
    placeAtStart();
    setMode(next);
    walkTo(0);
  }

  function startRoam(): void {
    setCurtains(true, true);
    if (mode === 'menu' || mode === 'summary') placeAtStart();
    travel = null;
    roamIndex = -1;
    setMode('roam');
    controls.lock();
  }

  function reveal(): void {
    if (mode !== 'recall' || revealed || travel) return;
    revealed = true;
    world.stations[index].curtainTarget = 1;
    world.stations[index].setLabel(true);
    renderPanel();
  }

  function grade(remembered: boolean): void {
    if (mode !== 'recall' || !revealed) return;
    results[index] = remembered;
    if (index + 1 < count) {
      walkTo(index + 1);
      return;
    }
    const missed = palace.loci.filter((_, i) => !results[i]);
    const review = recordWalk(palace.id, {
      at: new Date().toISOString(),
      correct: count - missed.length,
      total: count,
      missed: missed.map((l) => l.id),
    });
    const missedList = missed.length
      ? `<p>Missed:</p><ul>${missed
          .map((l) => `<li><b>${escapeHtml(l.answer)}</b> at ${propFor(palace.loci.indexOf(l)).name}</li>`)
          .join('')}</ul>`
      : '<p>A clean walk. The interval grows.</p>';
    showSummary(
      'Recall walk complete',
      `${count - missed.length} of ${count} remembered`,
      `${missedList}<p class="muted">${escapeHtml(describeDue(review))}</p>`,
      `<button data-act="recall">Walk again</button><button data-act="learn" class="quiet">Learning walk</button><button data-act="menu" class="quiet">Menu</button>`,
    );
  }

  function step(delta: 1 | -1): void {
    if (mode !== 'learn') return;
    const next = index + delta;
    if (next < 0) return;
    if (next < count) {
      walkTo(next);
      return;
    }
    showSummary(
      'End of the palace',
      `That was all ${count}`,
      '<p>Close your eyes and walk the route back from the front door. Then test yourself with the curtains drawn.</p>',
      `<button data-act="recall">Recall walk</button><button data-act="learn" class="quiet">Walk again</button><button data-act="menu" class="quiet">Menu</button>`,
    );
  }

  function showSummary(eyebrow: string, title: string, body: string, actions: string): void {
    $('summary-card').innerHTML = `<p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2>${body}<div class="actions">${actions}</div>`;
    setMode('summary');
  }

  function renderPanel(): void {
    const panel = $('panel');
    const i = mode === 'roam' ? roamIndex : index;
    if (!(mode === 'learn' || mode === 'recall' || (mode === 'roam' && i >= 0))) {
      panel.hidden = true;
      return;
    }
    const locus = palace.loci[i];
    const wing = palace.wings[locus.wing];
    const header = `<p class="eyebrow">${roman(i + 1)} of ${roman(count)} · ${escapeHtml(wing.name)} wing</p><p class="where">At ${propFor(i).name}…</p>`;
    const answer = `<h2>${escapeHtml(locus.answer)} <span class="dates">${escapeHtml(locus.dates)}</span></h2>
      <p class="hook">Sounds like <b>${escapeHtml(locus.hook)}</b></p>
      <p class="scene">${escapeHtml(locus.scene)}</p>
      <ul>${locus.facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`;
    let body = answer;
    let actions = '';
    if (mode === 'recall' && !revealed) {
      body = '<p class="question">What is behind the curtain?</p><p class="muted">Picture the scene and name it, then reveal.</p>';
      actions = '<button data-act="reveal">Reveal<kbd>Space</kbd></button>';
    } else if (mode === 'recall') {
      actions = '<button data-act="got">Remembered<kbd>1</kbd></button><button data-act="missed" class="quiet">Forgot<kbd>2</kbd></button>';
    } else if (mode === 'learn') {
      actions = `<button data-act="prev" class="quiet"${index === 0 ? ' disabled' : ''}>Back<kbd>←</kbd></button><button data-act="next">${index + 1 < count ? 'Next' : 'Finish'}<kbd>→</kbd></button>`;
    }
    panel.innerHTML = `${header}${body}<div class="actions">${actions}</div>`;
    panel.classList.toggle('walking', travel !== null);
    panel.hidden = false;
  }

  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!button) {
      if (mode === 'roam' && event.target === renderer.domElement) controls.lock();
      return;
    }
    button.blur();
    const act = button.dataset.act;
    if (act === 'learn' || act === 'recall') startGuided(act);
    else if (act === 'roam') startRoam();
    else if (act === 'menu') goMenu();
    else if (act === 'reveal') reveal();
    else if (act === 'got') grade(true);
    else if (act === 'missed') grade(false);
    else if (act === 'next') step(1);
    else if (act === 'prev') step(-1);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mode !== 'menu') {
      goMenu();
      return;
    }
    if (mode === 'roam') {
      keys.add(event.code);
      if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (mode === 'learn') {
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
    } else if (mode === 'recall') {
      if (event.key === ' ' || event.key === 'Enter') reveal();
      else if (event.key === '1') grade(true);
      else if (event.key === '2') grade(false);
    }
    if (event.key === ' ') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  controls.addEventListener('unlock', () => {
    if (mode === 'roam') goMenu();
  });

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const forward = new THREE.Vector3();
  const toWall = new THREE.Vector3();

  function updateRoam(dt: number): void {
    const held = (...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0);
    const turn = held('ArrowLeft', 'KeyQ') - held('ArrowRight', 'KeyE');
    const ahead = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown');
    const strafe = held('KeyD') - held('KeyA');
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) * dt;
    if (turn) camera.rotateOnWorldAxis(UP, turn * TURN_SPEED * dt);
    if (ahead) controls.moveForward(ahead * speed);
    if (strafe) controls.moveRight(strafe * speed);

    const p = camera.position;
    for (const c of world.colliders) {
      const minX = c.minX - PLAYER_RADIUS;
      const maxX = c.maxX + PLAYER_RADIUS;
      const minZ = c.minZ - PLAYER_RADIUS;
      const maxZ = c.maxZ + PLAYER_RADIUS;
      if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) continue;
      const pushes = [minX - p.x, maxX - p.x, minZ - p.z, maxZ - p.z];
      const k = pushes.reduce((best, v, j) => (Math.abs(v) < Math.abs(pushes[best]) ? j : best), 0);
      if (k < 2) p.x += pushes[k];
      else p.z += pushes[k];
    }

    camera.getWorldDirection(forward);
    let nearest = -1;
    let nearestDistance = ROAM_RANGE;
    layout.spots.forEach((spot, i) => {
      toWall.set(spot.wall.x - p.x, 0, spot.wall.z - p.z);
      const distance = toWall.length();
      if (distance < nearestDistance && toWall.dot(forward) > 0) {
        nearest = i;
        nearestDistance = distance;
      }
    });
    if (nearest !== roamIndex) {
      roamIndex = nearest;
      renderPanel();
    }
  }

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (travel) {
      travel.t = Math.min(1, travel.t + dt / travel.duration);
      const t = travel.t;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      pathPos = THREE.MathUtils.lerp(travel.from, travel.to, eased);
      camera.position.copy(curve.getPoint(pathPos));
      camera.quaternion.slerpQuaternions(travel.q0, travel.q1, eased);
      if (t >= 1) {
        travel = null;
        renderPanel();
      }
    }
    if (mode === 'roam') updateRoam(dt);
    world.update(dt);
    renderer.render(scene, camera);
  });

  goMenu();
}

main().catch((error: unknown) => {
  const el = $('error');
  el.textContent = error instanceof Error ? error.message : String(error);
  el.hidden = false;
});
