function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="section-header">
      <div className="section-header-main">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="section-title">{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {action && <div className="section-header-action">{action}</div>}
    </div>
  )
}

export default SectionHeader
