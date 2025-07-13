import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Log app version from package.json
console.log('App Version: 0.0.0');

createRoot(document.getElementById("root")!).render(<App />);
