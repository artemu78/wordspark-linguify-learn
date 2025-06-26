import { defineConfig, mergeConfig, type UserConfig } from 'vitest/config'
import baseViteConfig from './vite.config'

// Call the function to get the config object
const viteConfigObject = (baseViteConfig as ({ mode }: { mode: string }) => UserConfig)({ mode: 'test' });

export default mergeConfig(viteConfigObject, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts', // Optional: if you need global test setup
    css: true, // If your components import CSS files
  },
}))
