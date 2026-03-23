/// <reference types="vite/client" />

declare global {
  interface Window {
    desktopApp?: {
      platform: string
    }
  }
}

export {}
