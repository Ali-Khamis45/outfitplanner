/** Metadata for an exported avatar; the GLB remains a separate local artifact. */
export interface AvatarAssetMetadata {
  schemaVersion: 1;
  assetId: string;
  format: "glb";
  createdAt: string;
  rigged: boolean;
}

/** A garment region; vertices carry it in the `_REGION` glTF attribute (0 torso, 1 left sleeve, 2 right sleeve). */
export type GarmentRegion = "torso" | "left_sleeve" | "right_sleeve";

/**
 * Metadata embedded in a garment GLB at `asset.extras.garment` (Sprint 1.0, schema 1). The GLB carries its
 * own copy of the MHR skeleton; at load time it is rebound to the avatar's bones by joint name, and only
 * if its inverse bind matrices match the avatar's (`skeleton.inverseBindSha256` identifies the bind pose).
 */
export interface GarmentAssetMetadata {
  schemaVersion: 1;
  garmentId: string;
  category: "tshirt";
  displayName: string;
  units: "meters";
  upAxis: "+Y";
  forwardAxis: "+Z";
  bodyVariant: "neutral" | "personal-identity" | "personal-identity-scale";
  retargetedFrom: "neutral" | null;
  skeleton: { standard: "MHR"; jointCount: number; rootJoint: string; inverseBindSha256: string };
  regions: GarmentRegion[];
  openings: Array<"hem" | "neck" | "left_sleeve" | "right_sleeve">;
  thicknessM: number;
  material: { model: "pbr-metallic-roughness"; baseColor: string; metalness: number; roughness: number; colorAdjustable: boolean };
  fit: { strategy: string; rules: Record<string, number | boolean> };
  provenance: { generator: string; sourceBody: string; personalData: boolean };
  /** Sprint 1.1+: rule-set revision (absent on Sprint 1.0 assets), e.g. "v2" or "v2-lod". */
  revision?: string;
  /** Sprint 1.1+: rigid +Y translation applied to the fitted body to put its feet on y = 0 (absent when none). */
  bodyFloorOffsetM?: number;
}
