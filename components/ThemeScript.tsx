// Runs before first paint: reads the device preference and paints the theme
// on <html> so dark mode never flashes white. Kept dependency-free and tiny.
// Must stay in sync with ThemeProvider (key, attribute, class, meta color) and
// with defaultAppearance() in lib/appearance.ts (no stored choice: dark in the
// app, the system setting on the public site and auth pages).

const SCRIPT = `(function(){try{
var k="socia-appearance",a=localStorage.getItem(k);
if(a!=="light"&&a!=="dark"&&a!=="system"){var p=location.pathname;a=(p==="/"||/^\/(login|signup|reset-password|pricing|privacy|terms|oauth|scorer|auth)(\/|$)/.test(p))?"system":"dark";}
var r=a==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):a;
var e=document.documentElement;e.dataset.theme=r;e.classList.toggle("dark",r==="dark");e.style.colorScheme=r;
var m=document.querySelector('meta[name="theme-color"]:not([media])');if(m)m.content=r==="dark"?"#0b0d10":"#f5f6fa";
}catch(e){}})();`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
