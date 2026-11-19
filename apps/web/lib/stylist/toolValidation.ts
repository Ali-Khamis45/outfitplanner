import definitions from "./tools.json" with { type: "json" };

type Schema = { type?: string; properties?: Record<string, Schema | undefined>; required?: string[]; additionalProperties?: boolean; items?: Schema; enum?: unknown[]; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; uniqueItems?: boolean };

/** Measure conformance to the advertised tool schemas; execution keeps its existing validation. */
function matches(value: unknown, schema: Schema): boolean {
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>, properties = schema.properties ?? {};
    return (schema.required ?? []).every(key => Object.hasOwn(object, key))
      && Object.entries(object).every(([key, entry]) => Object.hasOwn(properties, key) && properties[key] ? matches(entry, properties[key]) : schema.additionalProperties !== false);
  }
  if (schema.type === "array") return Array.isArray(value) && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity)
    && (!schema.uniqueItems || new Set(value.map(entry => JSON.stringify(entry))).size === value.length) && value.every(entry => !schema.items || matches(entry, schema.items));
  if (schema.type === "integer" || schema.type === "number") return typeof value === "number" && Number.isFinite(value)
    && (schema.type !== "integer" || Number.isInteger(value)) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
  if (schema.type === "string") return typeof value === "string";
  return false;
}

export function validToolArguments(name: string, args: unknown): boolean {
  const definition = definitions.find(tool => tool.function.name === name);
  return !!definition && matches(args, definition.function.parameters as Schema);
}
