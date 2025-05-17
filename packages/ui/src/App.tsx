import React from 'react'
import { Button } from './components/Button'
import { Card } from './components/Card'

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <Card className="max-w-md mx-auto" variant="elevated" padding="lg">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Hello World!</h1>
        <p className="text-gray-600 mb-6">
          Welcome to Rohit Constellation UI Library. This is a simple demonstration of our components.
        </p>
        <div className="space-x-4">
          <Button variant="primary">Primary Button</Button>
          <Button variant="secondary">Secondary Button</Button>
          <Button variant="outline">Outline Button</Button>
        </div>
      </Card>
    </div>
  )
} 