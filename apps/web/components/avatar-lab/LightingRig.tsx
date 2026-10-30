"use client";
export function LightingRig() {
  return <><ambientLight intensity={1.05} /><hemisphereLight args={["#e3f1ed", "#303b3b", 1.35]} />
    <directionalLight position={[3, 5, 4]} intensity={3.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-bias={-0.00015} />
    <directionalLight position={[-3, 2, -3]} intensity={1.8} color="#b7dfd2" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]} receiveShadow><circleGeometry args={[8, 64]} /><meshStandardMaterial color="#182124" roughness={1} /></mesh>
  </>;
}
