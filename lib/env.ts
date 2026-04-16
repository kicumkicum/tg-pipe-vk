import { ConfigError } from "./errors";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new ConfigError([name]);
  }
  return value;
}

/** Проверить несколько переменных и выбросить одну ошибку со списком всех отсутствующих. */
export function requireEnvAll(names: readonly string[]): void {
  const missing = names.filter(n => {
    const v = process.env[n];
    return !v || v.trim() === "";
  });
  if (missing.length > 0) {
    throw new ConfigError(missing);
  }
}
