/**
 * Sound bus — lightweight re-export so any module can fire a cue
 * without importing the full engine.
 * The engine registers itself on the "tazama:sound" event.
 */
export function playSoundCue(name: string): void {
  document.dispatchEvent(new CustomEvent("tazama:sound", { detail: name }));
}
