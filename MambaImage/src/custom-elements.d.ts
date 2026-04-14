import type * as React from 'react'
import type { ImgHTMLAttributes } from 'react'

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'img-comparison-slider': {
        class?: string
        style?: React.CSSProperties
        children?: React.ReactNode
        ref?: React.Ref<HTMLElement>
        value?: number | string
      }
      img: ImgHTMLAttributes<HTMLImageElement> & {
        slot?: string
      }
    }
  }
}
