export function compressGlb(input: Uint8Array): Promise<Uint8Array>;
export function compressedAsset(source: string, cacheDir?: string, gzip?: boolean): Promise<Uint8Array>;
export function prepareAssetCache(cacheDir?: string): Promise<void>;
export function compressedPersonalAsset(source: string, gzip?: boolean): Promise<Uint8Array>;
export function clearPersonalAssetMemory(): void;
