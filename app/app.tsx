import { WindowFrame } from './shell'
import { ProjectsApp } from './components/projects/projects-app'
import './styles/app.css'

export default function App() {
  return (
    <WindowFrame title="DevDock">
      <ProjectsApp />
    </WindowFrame>
  )
}
