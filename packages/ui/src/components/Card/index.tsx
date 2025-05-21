import React from 'react'

export interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  variant?: 'elevated' | 'outlined' | 'filled'
  onClick?: () => void
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  variant = 'elevated',
  onClick,
  ...props
}) => {
  const baseStyles = 'rounded-lg'
  
  const variantStyles = {
    elevated: 'bg-white shadow-lg',
    outlined: 'border border-gray-200 bg-white',
    filled: 'bg-gray-50'
  }

  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  }

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
} 