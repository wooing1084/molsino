const path = require('node:path');

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.molsino.desktop',
    appCategoryType: 'public.app-category.games',
    executableName: 'molsino',
    icon: path.join(__dirname, 'resources/icons/molsino'),
    extraResource: [path.join(__dirname, 'resources/icons/molsino.png')],
  },
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32'] },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'molsino',
        setupExe: 'molsino-Setup.exe',
        setupIcon: path.join(__dirname, 'resources/icons/molsino.ico'),
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
