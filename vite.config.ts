import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// allowedHosts lets the dev server answer when it is opened through an ngrok tunnel (`npm run tunnel`); it only
// affects `vite` / `vite preview` on this computer, never the production build.
const ngrokHosts = ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev', '.ngrok.io']
export default defineConfig({ plugins: [react(), tailwindcss()], server: { allowedHosts: ngrokHosts }, preview: { allowedHosts: ngrokHosts } })
