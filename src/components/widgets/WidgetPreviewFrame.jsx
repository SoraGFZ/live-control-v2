import { useEffect, useRef, useState } from 'react'

/**
 * Monta el contenido de preview solo cuando la tarjeta entra al viewport (muchas iframes).
 */
function WidgetPreviewFrame({ children, className = '' }) {
  const rootRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const node = rootRef.current
    if (!node) {
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '160px 0px', threshold: 0.05 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={rootRef} className={`tc-widget-preview-stage ${className}`.trim()}>
      {isVisible ? (
        <div className="tc-widget-preview-stage-inner">{children}</div>
      ) : (
        <div className="tc-widget-preview-placeholder">
          <span>Vista previa</span>
        </div>
      )}
    </div>
  )
}

export default WidgetPreviewFrame