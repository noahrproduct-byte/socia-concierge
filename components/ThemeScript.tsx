// Runs before first paint: paints the theme on <html> so dark mode never
// flashes white. The script and its notes live in lib/themeScript.ts.
import { SCRIPT } from "@/lib/themeScript";

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
