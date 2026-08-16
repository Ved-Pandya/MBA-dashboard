export function normalizeConfigValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed.at(-1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export function normalizeVapidKey(value: string | undefined) {
  return normalizeConfigValue(value).replace(/=+$/, "");
}

export function isVapidPublicKey(value: string) {
  return value.length === 87 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function isVapidPrivateKey(value: string) {
  return value.length === 43 && /^[A-Za-z0-9_-]+$/.test(value);
}
