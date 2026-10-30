/** Metadata for an exported avatar; the GLB remains a separate local artifact. */
export interface AvatarAssetMetadata {
  schemaVersion: 1;
  assetId: string;
  format: "glb";
  createdAt: string;
  rigged: boolean;
}
