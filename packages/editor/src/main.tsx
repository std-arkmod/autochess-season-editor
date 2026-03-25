import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import { MantineProvider, createTheme } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import App from './App.tsx'

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily: '"Frex Sans GB VF", "Source Han Sans SC", "Noto Sans SC", sans-serif',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </StrictMode>,
)
