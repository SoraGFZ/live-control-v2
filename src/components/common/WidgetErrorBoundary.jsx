import { Component } from 'react'

class WidgetErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Error de vista previa',
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="surface-card" style={{ padding: 14 }}>
          <strong>Vista previa no disponible</strong>
          <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>{this.state.message}</p>
        </div>
      )
    }

    return this.props.children
  }
}

export default WidgetErrorBoundary