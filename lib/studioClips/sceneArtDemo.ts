// Stand-in drawings for the development pages (/dev/scene-lab, /dev/studio-lab): what a picture scene looks
// like without asking a model. The warehouse is drawn by hand here; the outline of Egypt is the one
// lib/studioClips/countryMap.ts would give. Not used by the product.
import type { SceneArt } from "./sceneArt";

export const DEMO_WAREHOUSE: SceneArt = { kind: "draw", name: "Warehouse", move: "pulse", shapes: [
  { d: "M10 44 L50 22 L90 44 V88 H10 Z", fill: "accent", stroke: "none" },
  { d: "M6 46 L50 20 L94 46", fill: "none", stroke: "light", w: 4 },
  { d: "M34 88 V58 H66 V88 Z", fill: "dark", stroke: "none" },
  { d: "M34 66 H66 M34 74 H66 M34 82 H66", fill: "none", stroke: "mid", w: 2 },
  { d: "M44 34 H56 V44 H44 Z", fill: "dark", stroke: "none" },
  { d: "M72 88 V76 H84 V88 Z", fill: "light", stroke: "none" },
] };
export const DEMO_EGYPT: SceneArt = { kind: "map", name: "Egypt", d: "M96,90.9L51.0,90.1L6.0,90.9L6.0,30.7L4,21.8L6.0,16.7L5.1,11.8L7.4,9.0L9.1,10.2L13.0,9.3L23.2,11.4L28.6,13.9L32.8,14.3L36.2,16.0L39.7,15.4L43.5,12.7L45.7,12.5L47.0,10.7L51.6,10.7L52.0,9.5L55.5,10.7L58.3,10.0L57.4,12.2L59.9,13.9L61.6,12.5L63.7,14.2L67.7,13.3L68.2,14.0L73.5,13.2L75.8,11.9L76.1,12.9L79.2,21.9L81.1,28.1L79.8,29.9L77.3,40.7L75.9,42.8L72.4,40.4L68.6,35.9L67.3,31.6L64.6,27.7L63.4,23.8L61.8,26.7L63.4,28.9L63.9,32.3L65.9,36.0L70.8,41.7L70.9,44.2L73.4,48.9L73.9,52.3L78.5,60.4L83.3,70.5L87.7,75.0L85.9,75.1L85.8,79.1L87.1,83.2L88.7,84.9L91.1,85.8Z", c: [42.9, 52.6] };
