import { Config } from "@remotion/cli/config";

// Captured frames + the full-page screenshot live in captures/; serve them as
// the static dir so the comp can address them with staticFile().
Config.setPublicDir("captures");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
