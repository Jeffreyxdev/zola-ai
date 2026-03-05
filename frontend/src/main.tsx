import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter as Router } from 'react-router-dom'
import App from './App.tsx'
import SolanaWalletProvider from './components/SolanaWalletProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <Router>
    <SolanaWalletProvider>
      <App />
    </SolanaWalletProvider>
  </Router>,
)
