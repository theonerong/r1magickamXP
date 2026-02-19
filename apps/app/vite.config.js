import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    
    // DISABLE SOURCE MAPS - huge savings
    sourcemap: false,
    
    // BETTER MINIFICATION
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log']
      }
    },
    
    // CHUNK SIZE WARNINGS
    chunkSizeWarningLimit: 500,
    
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        // SPLIT INTO SMALLER CHUNKS
        manualChunks(id) {
          // Don't split presets - they're already separate
          if (id.includes('presets.json')) return 'presets';
          
          // Split node_modules (when dependencies are added)
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        
        // Better file naming
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  
  // OPTIMIZE DEPENDENCIES
  optimizeDeps: {
    exclude: ['presets.json']
  }
})