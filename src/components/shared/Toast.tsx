import { toasts } from '../../store'

export function ToastContainer() {
  const items = toasts.value

  if (items.length === 0) return null

  return (
    <div class="toast-container">
      {items.map((t: { id: string; message: string; type: string }) => (
        <div key={t.id} class={`toast show ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
