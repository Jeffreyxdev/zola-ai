import { Route, Routes } from "react-router-dom"
import Home from "./pages/Home"
import Dashboard from "./pages/dashboard/dash"
function App() {
 

  return (
    <>
    <Routes>
      <Route path="/" element={<Home/>} />
      <Route path="/dashboard/*" element={<Dashboard/>} />
    </Routes>
    </>
  )
}

export default App
