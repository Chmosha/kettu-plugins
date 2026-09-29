function isValid(value: any) {
  if (value === false || value === 0) return true;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function cloneAndFilter<T extends object>(object: T): T {
  const replacer = (key: string, value: any) => {
    if (key.startsWith("_")) return undefined;
    return isValid(value) ? value : undefined;
  };
  return JSON.parse(JSON.stringify(object, replacer));
}
