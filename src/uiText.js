// Phaser renders each Text object into its own canvas texture. Render those
// textures above 1x for the responsive game frame and high-DPI displays.
const DISPLAY_SCALE_CAP = 2;

export function addText(scene, ...args) {
  const dpr = window.devicePixelRatio || 1;
  const resolution = Math.min(dpr * DISPLAY_SCALE_CAP, 4);
  return scene.add.text(...args).setResolution(resolution);
}
