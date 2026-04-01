import { relative, sep, isAbsolute, resolve } from "node:path";

/** POSIX-style relative path from root. Stable across platforms and nice in reports. */
export function relFromRoot(root: string, file: string): string {
  const abs = isAbsolute(file) ? file : resolve(root, file);
  const r = relative(root, abs);
  return r.split(sep).join("/");
}

export function absFromRoot(root: string, file: string): string {
  return isAbsolute(file) ? file : resolve(root, file);
}
