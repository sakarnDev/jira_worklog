import { useState, useEffect } from 'react'

export function useLocalStorage(key: string, initialValue: string | number) {
  const [value, setValue] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const item = localStorage.getItem(key)
        return item ? JSON.parse(item) : initialValue
      } catch (error) {
        console.error('Error retrieving from localStorage:', error)
        return initialValue
      }
    }
    return initialValue
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch (error) {
        console.error('Error saving to localStorage:', error)
      }
    }
  }, [key, value])

  return [value, setValue]
}
