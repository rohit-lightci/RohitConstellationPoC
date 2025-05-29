// Common types that can be used across components
export type Size = 'sm' | 'md' | 'lg'
export type Variant = 'primary' | 'secondary' | 'outline'

// Theme types
export interface Theme {
  colors: {
    primary: string
    secondary: string
    background: string
    text: string
  }
  spacing: {
    sm: string
    md: string
    lg: string
  }
  borderRadius: string
  typography: {
    fontFamily: string
    fontSize: {
      sm: string
      md: string
      lg: string
    }
  }
} 