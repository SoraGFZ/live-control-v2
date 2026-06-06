import SectionHeader from '../common/SectionHeader'
import TriggerListTable from '../tables/TriggerListTable'

function TriggersSection({
  actions,
  emoteCatalog,
  giftCatalog,
  onCreateTrigger,
  onEditTrigger,
  onRemoveTrigger,
  title = 'Eventos del live',
  description = 'Cada evento asocia una acción con un follow, gift, chat, emote o share.',
  triggers,
}) {
  return (
    <section className="panel-section" id="triggers">
      <SectionHeader
        eyebrow="Eventos"
        title={title}
        description={description}
        action={
          <button type="button" className="primary-button" onClick={onCreateTrigger} disabled={actions.length === 0}>
            Crear evento
          </button>
        }
      />

      <TriggerListTable
        actions={actions}
        emoteCatalog={emoteCatalog}
        giftCatalog={giftCatalog}
        onEditTrigger={onEditTrigger}
        onRemoveTrigger={onRemoveTrigger}
        triggers={triggers}
      />
    </section>
  )
}

export default TriggersSection
