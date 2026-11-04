// Runs before first paint: paints the light theme on <html>. SOCIA is light
// only for now; the dark token values stay in app/styles/tokens.css so a
// dark mode can come back without redesigning it. Must stay in sync with
// applyResolved in components/ThemeProvider.tsx (attribute, class, meta color)
// and THEME_COLOR in lib/appearance.ts.

export const SCRIPT = `(function(){try{
var e=document.documentElement;e.dataset.theme="light";e.classList.remove("dark");e.style.colorScheme="light";
var m=document.querySelector('meta[name="theme-color"]:not([media])');if(m)m.content="#f5f4f1";
}catch(e){}})();`;
