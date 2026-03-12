import { Btn, Modal } from '../../components/ui'

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  danger = true,
  confirmDisabled = false,
  cancelDisabled = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={(
        <>
          <Btn variant="ghost" onClick={onCancel} disabled={cancelDisabled}>Cancel</Btn>
          <Btn
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Btn>
        </>
      )}
    >
      <p style={{ fontSize: 14, color: 'var(--text-2)' }}>{message}</p>
    </Modal>
  )
}
