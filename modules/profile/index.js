// modules/profile/index.js
// Entry point for the profile module
import { initUI } from './ui.js';
import { initLogic } from './logic.js';
import { initFirebase } from './firebase.js';

export function initModule(rootEl = document.body, options = {}) {
  initFirebase();
  initLogic(options);
  return initUI(rootEl, options);
}

export default initModule;
