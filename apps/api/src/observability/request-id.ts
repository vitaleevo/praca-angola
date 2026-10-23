import { randomUUID } from "node:crypto";

const VALID = /^[A-Za-z0-9._:-]{8,64}$/;

export function normalizeRequestId(value: string | undefined): string {
  if (!value) return randomUUID();
  const candidate = value.slice(0, 64);
  return VALID.test(candidate) ? candidate : randomUUID();
}
