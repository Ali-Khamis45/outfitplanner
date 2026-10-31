"use client";
export function LightingRig() {
  return <><ambientLight intensity={1.05} /><hemisphereLight args={["#e3f1ed", "#303b3b", 1.35]} />
    {/* Shadow acne fix: a 6 m frustum at 1024² gave ~5.9 mm texels that speckled curved self-shadowing surfaces.
        A 3.2 m frustum at 2048² (~1.6 mm texels) plus a normal-offset bias removes it without detaching shadows. */}
    <directionalLight position={[3, 5, 4]} intensity={3.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-1.6} shadow-camera-right={1.6} shadow-camera-top={1.6} shadow-camera-bottom={-1.6} shadow-camera-near={1} shadow-camera-far={14} shadow-bias={-0.0002} shadow-normalBias={0.02} />
    <directionalLight position={[-3, 2, -3]} intensity={1.8} color="#b7dfd2" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]} receiveShadow><circleGeometry args={[8, 64]} /><meshStandardMaterial color="#182124" roughness={1} /></mesh>
  </>;
}
