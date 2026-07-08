/// <reference types="vite/client" />
import type { HelixApi } from '../../shared/types'

declare global {
  interface Window {
    api: HelixApi
  }
}

export {}
