// Runs before first paint: reads the device preference and paints the theme
// on <html> so dark mode never flashes white. Kept dependency-free and tiny.
// Must stay in sync with ThemeProvider (key, attribute, class, meta color).

const SCRIPT = `(function(){try{
var k="socia-appearance",a=localStorage.getItem(k);
if(a!=="light"&&a!=="dark")a="system";
var r=a==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):a;
var e=document.documentElement;e.dataset.theme=r;e.classList.toggle("dark",r==="dark");e.style.colorScheme=r;
var m=document.querySelector('meta[name="theme-color"]:not([media])');if(m)m.content=r==="dark"?"#0b1220":"#f5f6fa";
}catch(e){}})();`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
