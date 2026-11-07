import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la página funciona en cualquier carpeta del servidor,
  // por ejemplo https://<usuario>.github.io/gielis-web/ (GitHub Pages).
  base: './',
})
