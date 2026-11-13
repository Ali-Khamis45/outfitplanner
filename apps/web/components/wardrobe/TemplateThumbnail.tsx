"use client";
/* Thumbnails come from a private local route or an in-memory canvas. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { loadGarmentTexture } from "../../lib/garment/texture";
import type { WardrobeItem } from "../../lib/wardrobe/schema";

const knownTemplates: Record<string, string> = { "tshirt-v5.2": "v5.2", "pants-v2": "pants-v2", "pants-basic-v2": "pants-v2" };
const pending = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();
let rendererState: Promise<RendererState> | null = null;
type RendererState = Awaited<ReturnType<typeof createRenderer>>;

async function createRenderer() {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(320, 360, false); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#e9e9e0");
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb7b9ae, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(2, 3, 4); scene.add(light);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const models = new Map<string, Promise<import("three").Object3D>>();
  return { THREE, renderer, scene, loader, models };
}
async function draw(template: string, color: string, texturePath?: string | null): Promise<string> {
  rendererState ??= createRenderer();
  const { THREE, renderer, scene, loader, models } = await rendererState;
  const variant = knownTemplates[template];
  if (!models.has(variant)) models.set(variant, loader.loadAsync(`/api/demo-garment?variant=${variant}`).then(gltf => gltf.scene));
  const model = await models.get(variant)!;
  const texture = texturePath ? await loadGarmentTexture(texturePath).catch(() => null) : null;
  model.traverse(object => { if (object instanceof THREE.Mesh) { object.material = new THREE.MeshStandardMaterial({ color: texture ? "#ffffff" : color, map: texture, roughness: 0.85, side: THREE.DoubleSide }); object.frustumCulled = false; } });
  scene.add(model); model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, size.x * 360 / 320) * 1.3;
  if (!Number.isFinite(height) || height <= 0) throw new Error("Invalid template bounds");
  const camera = new THREE.OrthographicCamera(-height * 320 / 360 / 2, height * 320 / 360 / 2, height / 2, -height / 2, 0.01, 20);
  camera.position.set(center.x, center.y, center.z + Math.max(2, size.z + 1)); camera.lookAt(center); camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const png = renderer.domElement.toDataURL("image/png");
  scene.remove(model);
  model.traverse(object => { if (object instanceof THREE.Mesh) { const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
  texture?.dispose();
  return png;
}
function thumbnail(template: string, color: string, texture?: string | null): Promise<string | null> {
  if (texture) { const render = queue.then(() => draw(template, color, texture)); queue = render.catch(() => {}); return render.catch(() => null); }
  const key = `${template}:${color.toLowerCase()}`, existing = pending.get(key);
  if (existing) return existing;
  const url = `/api/wardrobe-thumbnail?${new URLSearchParams({ template, color: color.slice(1) })}`;
  const result = fetch(url, { cache: "no-store" }).then(async response => {
    if (response.ok) return url;
    const render = queue.then(() => draw(template, color));
    queue = render.catch(() => {});
    const data = await render;
    const saved = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    return saved.ok ? url : data;
  }).catch(() => null);
  pending.set(key, result);
  void result.then(value => { if (!value) pending.delete(key); });
  return result;
}

export function TemplateThumbnail({ item }: { item: WardrobeItem }) {
  const template = item.template ?? "", color = item.colors.reduce((best, entry) => entry.share > best.share ? entry : best).hex;
  const [result, setResult] = useState<{ key: string; url: string | null } | null>(null);
  const key = `${template}:${color.toLowerCase()}:${item.texture ?? ""}`;
  useEffect(() => { let active = true; if (Object.hasOwn(knownTemplates, template)) void thumbnail(template, color, item.texture).then(url => { if (active) setResult({ key, url }); }); return () => { active = false; }; }, [template, color, key, item.texture]);
  const src = result?.key === key ? result.url : null;
  return src ? <img src={src} alt="" /> : <span>{item.category}</span>;
}
