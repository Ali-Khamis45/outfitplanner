// Wardrobe templates the photo-to-texture producer (services/texture/produce.py, Sprint 4A) supports: the UV layout v3
// garments. Kept apart from the API module so client components can import it without Node built-ins.
export const PHOTO_TEXTURE_TEMPLATES: readonly string[] = ["tshirt-v5.3", "pants-v3"];
export const canCreatePhotoTexture = (template: string | null | undefined) => PHOTO_TEXTURE_TEMPLATES.includes(template ?? "");
