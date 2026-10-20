import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// SCENE SCALE: 1 unit = 1 cm (matches build_keyboard_75.py). The board is
// ~32 x 12.6 x 4.7 units. Every distance below is centimetres — an earlier
// pass had a metre-scale rig here and the lights ended up inside the model.
export const IS_MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 760;

export interface SceneRig {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ground: THREE.Mesh;
  bloom: UnrealBloomPass;
  lights: { key: THREE.DirectionalLight; rim: THREE.DirectionalLight };
  dispose: () => void;
}

export function createScene(canvas: HTMLCanvasElement, signal: AbortSignal): SceneRig {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE });
  renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.5 : 2));
  // No tone mapping: the fills are picked hex tones from the iso kit, and ACES
  // crushed them (and the page-matched background) toward black.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = IS_MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x131313); // --anatomy-card, Fig 5's plate

  // metals (brass plate, switch tops) render black without something to reflect
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  // Raised with the material pass: clearcoat and brass both read off the
  // environment, and at 0.55 the second lobe had nothing to catch.
  scene.environmentIntensity = 0.68;

  const camera = new THREE.PerspectiveCamera(32, 1, 1, 400);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(26, 46, 30);
  key.castShadow = true;
  key.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
  key.shadow.radius = 5;
  key.shadow.bias = -0.0015;
  const sc = key.shadow.camera;
  sc.near = 5;
  sc.far = 140;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.updateProjectionMatrix();
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(-34, 14, -28);
  scene.add(rim);

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.ShadowMaterial({ opacity: 0.35 }), // a halo under the drawing, not a cast shadow
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── post ────────────────────────────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    IS_MOBILE ? 0.16 : 0.3, // strength — "subtle bloom max"
    0.75, // radius
    0.92, // threshold: only the brightest glints bloom
  );
  if (!IS_MOBILE) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // sized to the canvas box, not the window: the canvas is the Fig 1 plate now,
  // a column beside the copy
  const resize = () => {
    const w = renderer.domElement.clientWidth || innerWidth;
    const h = renderer.domElement.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  // the canvas box changes with layout breakpoints, not only window size
  const ro = new ResizeObserver(resize);
  ro.observe(renderer.domElement);
  signal.addEventListener('abort', () => ro.disconnect());
  resize();

  const dispose = () => {
    envRT.dispose();
    pmrem.dispose();
    composer.dispose();
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    renderer.dispose();
  };

  return { renderer, composer, scene, camera, ground, bloom, lights: { key, rim }, dispose };
}

/** Distance at which `object` fills the frame; caller drives the orbit. */
export function fitDistance(camera: THREE.PerspectiveCamera, object: THREE.Object3D, fill = 1.28) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitH = size.y / 2 / Math.tan(fov / 2);
  // a tab loaded in the background has a 0×0 canvas, so aspect is NaN — and a
  // NaN distance stays NaN for the life of the page. Fall back to a wide frame.
  const aspect = camera.aspect > 0 ? camera.aspect : 16 / 9;
  const fitW = size.x / 2 / Math.tan(fov / 2) / aspect;
  return { dist: Math.max(fitH, fitW) * fill, center, size, box };
}
