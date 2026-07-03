// modules/news/index.js
// Entry point for the News module. UI is created first, then logic attaches to the UI container.
import { initUI } from './ui.js';
import { initLogic } from './logic.js';
import { initFirebase } from './firebase.js';

export function initModule(rootEl = document.body, options = {}) {
  initFirebase();
  const uiRoot = initUI(rootEl, options);
  // Pass the UI root so logic can populate dynamic parts
  initLogic({ rootEl: uiRoot, options });
  return uiRoot;
}

export default initModule;
