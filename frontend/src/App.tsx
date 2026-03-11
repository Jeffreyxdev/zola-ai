import { Route, Routes } from "react-router-dom"
import Home from "./pages/Home"
import Dashboard from "./pages/dashboard/dash"
import AdminLayout from "./pages/admin/AdminLayout"

function App() {
  return (
    <>
      <Routes>
        <Route path="/"          element={<Home />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="/admin/*"   element={<AdminLayout />} />
      </Routes>
    </>
  )
}

export default App
