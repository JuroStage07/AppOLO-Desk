// Setup global para las pruebas con Vitest + React Testing Library.
// Registra los matchers de jest-dom (p. ej. toBeInTheDocument, toHaveTextContent)
// y limpia el DOM tras cada prueba para aislar los tests de componentes.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
