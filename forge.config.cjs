module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.overlayblackjack.desktop',
    executableName: 'overlay-blackjack',
  },
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32'] },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'overlay_blackjack',
        setupExe: 'Overlay-Blackjack-Setup.exe',
        noMsi: true,
      },
    },
  ],
  plugins: [{
    name: '@electron-forge/plugin-vite',
    config: {
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.mts', target: 'main' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.mts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }],
    },
  }],
};
