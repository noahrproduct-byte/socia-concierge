// The Remotion licence key the browser render runs under. Remotion's web
// renderer asks for one (or "free-license" where the free licence applies:
// https://remotion.dev/license); set NEXT_PUBLIC_REMOTION_LICENSE_KEY in the
// deployment. Unset, the render still works and Remotion logs a reminder.
export function remotionLicenseKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY?.trim();
  return k || undefined;
}
