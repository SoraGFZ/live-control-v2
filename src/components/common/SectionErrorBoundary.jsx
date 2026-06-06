import { Component } from 'react'

class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error(`[Live Control] Error en seccion ${this.props.sectionId || 'panel'}:`, error)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-box" style={{ margin: '12px 0' }}>
          <strong>No se pudo cargar esta seccion.</strong>
          <p style={{ margin: '8px 0 0' }}>{this.state.error.message}</p>
          <button
            type="button"
            className="secondary-button"
            style={{ marginTop: '12px' }}
            onClick={() => this.setState({ error: null })}
          >
            Reintentar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default SectionErrorBoundary