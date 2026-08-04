import * as THREE from 'three';

/* ------------------------------------------------------------------
   Hero scene: an interactive infrastructure topology.
   - node cloud on a sphere (servers / regions)
   - nearest-neighbour links (network edges)
   - packets that travel along those links (live traffic)
   - deep particle field + expanding energy rings (ambient depth)
   Mouse and scroll drive the camera; render loop idles when hidden.
------------------------------------------------------------------- */

const COLORS = {
  red: new THREE.Color('#ff4d6d'),
  violet: new THREE.Color('#8b6cff'),
  blue: new THREE.Color('#6c7cff'),
  cyan: new THREE.Color('#57e2ff'),
};

function softSprite(inner = 1, falloff = 0.45) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(255,255,255,${inner})`);
  g.addColorStop(falloff, `rgba(255,255,255,${inner * 0.35})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function fibonacciSphere(count, radius) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius));
  }
  return pts;
}

export function initHeroScene(canvas) {
  if (!canvas || !canvas.parentElement) return null;

  // Bail out cleanly when WebGL is unavailable — the CSS/DOM hero still stands alone.
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    return null;
  }
  if (!renderer.getContext()) return null;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const compact = window.matchMedia('(max-width: 820px)').matches;

  const NODES = compact ? 52 : 96;
  const PACKETS = compact ? 70 : 190;
  const DUST = compact ? 500 : 1400;
  const RADIUS = compact ? 2.6 : 3.35;
  const MAX_LINK_DIST = compact ? 1.6 : 1.28;
  const LINKS_PER_NODE = 3;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060b, 0.055);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
  camera.position.set(0, 0, 10);

  const world = new THREE.Group();
  scene.add(world);

  /* ---------- nodes ---------- */
  const nodePos = fibonacciSphere(NODES, RADIUS);
  const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodePos);

  const nodeColors = new Float32Array(NODES * 3);
  const nodeSizes = new Float32Array(NODES);
  for (let i = 0; i < NODES; i++) {
    const t = (nodePos[i].x / RADIUS + 1) / 2;
    const c = COLORS.red.clone().lerp(COLORS.blue, t);
    nodeColors.set([c.r, c.g, c.b], i * 3);
    nodeSizes[i] = 0.16 + Math.random() * 0.2;
  }
  nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));

  const nodes = new THREE.Points(
    nodeGeo,
    new THREE.PointsMaterial({
      size: 0.26,
      map: softSprite(1, 0.35),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  world.add(nodes);

  /* ---------- links ---------- */
  const edges = [];
  for (let i = 0; i < NODES; i++) {
    const near = [];
    for (let j = 0; j < NODES; j++) {
      if (i === j) continue;
      const d = nodePos[i].distanceTo(nodePos[j]);
      if (d < MAX_LINK_DIST) near.push([d, j]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(LINKS_PER_NODE, near.length); k++) {
      const j = near[k][1];
      if (j > i) edges.push([i, j]);
    }
  }

  const linePos = new Float32Array(edges.length * 6);
  const lineCol = new Float32Array(edges.length * 6);
  edges.forEach(([i, j], e) => {
    const a = nodePos[i];
    const b = nodePos[j];
    linePos.set([a.x, a.y, a.z, b.x, b.y, b.z], e * 6);
    const t = (a.x / RADIUS + 1) / 2;
    const c = COLORS.red.clone().lerp(COLORS.blue, t).multiplyScalar(0.85);
    lineCol.set([c.r, c.g, c.b, c.r, c.g, c.b], e * 6);
  });

  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  linkGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));

  world.add(
    new THREE.LineSegments(
      linkGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );

  /* ---------- packets travelling the links ---------- */
  const packetGeo = new THREE.BufferGeometry();
  const packetPos = new Float32Array(PACKETS * 3);
  const packetCol = new Float32Array(PACKETS * 3);
  const packetState = [];

  function seedPacket(index, randomStart) {
    const edge = edges[Math.floor(Math.random() * edges.length)] || [0, 1];
    packetState[index] = {
      a: nodePos[edge[0]],
      b: nodePos[edge[1]],
      t: randomStart ? Math.random() : 0,
      speed: 0.0022 + Math.random() * 0.0075,
    };
    const c = Math.random() > 0.45 ? COLORS.cyan : COLORS.violet;
    packetCol.set([c.r, c.g, c.b], index * 3);
  }

  for (let i = 0; i < PACKETS; i++) seedPacket(i, true);

  packetGeo.setAttribute('position', new THREE.BufferAttribute(packetPos, 3));
  packetGeo.setAttribute('color', new THREE.BufferAttribute(packetCol, 3));

  const packets = new THREE.Points(
    packetGeo,
    new THREE.PointsMaterial({
      size: 0.13,
      map: softSprite(1, 0.3),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  world.add(packets);

  /* ---------- core ---------- */
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 1),
    new THREE.MeshBasicMaterial({ color: 0x9aa6ff, wireframe: true, transparent: true, opacity: 0.42 })
  );
  world.add(core);

  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(RADIUS * 1.02, 1),
    new THREE.MeshBasicMaterial({ color: 0x6c7cff, wireframe: true, transparent: true, opacity: 0.055 })
  );
  world.add(shell);

  /* ---------- energy rings ---------- */
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.045, 96),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x6c7cff : 0xff4d6d,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2.3;
    ring.userData.phase = i / 3;
    world.add(ring);
    rings.push(ring);
  }

  /* ---------- dust ---------- */
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos.set(
      [(Math.random() - 0.5) * 34, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 26],
      i * 3
    );
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 0.05,
      map: softSprite(0.8, 0.4),
      color: 0x9fb0ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(dust);

  /* ---------- sizing ---------- */
  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const { width, height } = parent.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize, { passive: true });

  /* ---------- interaction ---------- */
  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;
  let scrollT = 0;

  if (finePointer) {
    window.addEventListener(
      'pointermove',
      (e) => {
        targetX = (e.clientX / window.innerWidth) * 2 - 1;
        targetY = (e.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true }
    );
  }

  window.addEventListener(
    'scroll',
    () => {
      const h = canvas.parentElement?.offsetHeight || window.innerHeight;
      scrollT = Math.min(1, Math.max(0, window.scrollY / h));
    },
    { passive: true }
  );

  /* ---------- run loop ---------- */
  let onScreen = true;
  const io = new IntersectionObserver((entries) => {
    onScreen = entries[0]?.isIntersecting ?? true;
  }, { threshold: 0.02 });
  io.observe(canvas);

  let pageVisible = document.visibilityState === 'visible';
  document.addEventListener('visibilitychange', () => {
    pageVisible = document.visibilityState === 'visible';
  });

  // Static, composed frame for reduced-motion users.
  if (reduced) {
    world.rotation.set(0.26, -0.5, 0);
    rings.forEach((r, i) => {
      r.scale.setScalar(RADIUS * (0.7 + i * 0.35));
      r.material.opacity = 0.1;
    });
    for (let i = 0; i < PACKETS; i++) {
      const s = packetState[i];
      packetPos.set([
        s.a.x + (s.b.x - s.a.x) * s.t,
        s.a.y + (s.b.y - s.a.y) * s.t,
        s.a.z + (s.b.z - s.a.z) * s.t,
      ], i * 3);
    }
    packetGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
    canvas.dataset.ready = 'true';
    return { destroy: () => renderer.dispose() };
  }

  let spin = 0;
  let raf = 0;
  let elapsed = 0;

  // Compose and draw one frame straight away. Without this, a page opened in a
  // background tab (or restored session) would show an empty canvas until focus.
  function drawFirstFrame() {
    world.rotation.set(0.12, -0.35, 0);
    for (let i = 0; i < PACKETS; i++) {
      const s = packetState[i];
      packetPos.set([
        s.a.x + (s.b.x - s.a.x) * s.t,
        s.a.y + (s.b.y - s.a.y) * s.t,
        s.a.z + (s.b.z - s.a.z) * s.t,
      ], i * 3);
    }
    packetGeo.attributes.position.needsUpdate = true;
    rings.forEach((ring, i) => {
      ring.scale.setScalar(RADIUS * (0.6 + i * 0.45));
      ring.material.opacity = 0.1;
    });
    renderer.render(scene, camera);
  }

  drawFirstFrame();

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!onScreen || !pageVisible) return;

    elapsed += 0.016;
    spin += 0.0013;

    curX += (targetX - curX) * 0.045;
    curY += (targetY - curY) * 0.045;

    world.rotation.y = spin + curX * 0.5;
    world.rotation.x = curY * 0.3 + Math.sin(elapsed * 0.16) * 0.045;

    // scroll pushes the camera back and lifts it slightly — cinematic drift
    camera.position.z = 10 + scrollT * 5.5;
    camera.position.y = scrollT * 1.6;
    camera.lookAt(0, 0, 0);

    core.rotation.y -= 0.0045;
    core.rotation.x += 0.0028;
    const beat = 1 + Math.sin(elapsed * 1.5) * 0.045;
    core.scale.setScalar(beat);

    shell.rotation.y = -spin * 0.55;

    // packets
    for (let i = 0; i < PACKETS; i++) {
      const s = packetState[i];
      s.t += s.speed;
      if (s.t >= 1) seedPacket(i, false);
      const p = packetState[i];
      packetPos.set([
        p.a.x + (p.b.x - p.a.x) * p.t,
        p.a.y + (p.b.y - p.a.y) * p.t,
        p.a.z + (p.b.z - p.a.z) * p.t,
      ], i * 3);
    }
    packetGeo.attributes.position.needsUpdate = true;

    // energy rings expand outward and fade
    rings.forEach((ring) => {
      const phase = (elapsed * 0.13 + ring.userData.phase) % 1;
      ring.scale.setScalar(RADIUS * (0.35 + phase * 1.9));
      ring.material.opacity = Math.sin(phase * Math.PI) * 0.16;
    });

    dust.rotation.y = spin * 0.16;

    renderer.render(scene, camera);
  }

  frame();
  canvas.dataset.ready = 'true';

  return {
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
