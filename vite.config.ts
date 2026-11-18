import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          i18n: ['i18next', 'react-i18next'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: ['favicon.svg', 'icons/icon.svg'],
      manifest: {
        name: 'HarvestFlow',
        short_name: 'HarvestFlow',
        description: 'Agricultural harvest and logistics coordination',
        theme_color: '#1b5e20',
        background_color: '#f6f9f6',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
