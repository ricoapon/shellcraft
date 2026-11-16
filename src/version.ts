declare const __BUILD_VERSION__: string;

/** Identifies the loaded bundle independently of player saves. */
export const buildVersion =
  typeof __BUILD_VERSION__ === 'undefined' ? 'development' : __BUILD_VERSION__;
