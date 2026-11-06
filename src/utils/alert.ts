import Swal from 'sweetalert2'

/**
 * SweetAlert2 統一外觀（銀杏金＋毛玻璃，樣式在 style.css 的 .swal-glass）。
 * - 記帳這種頻繁的動作用右上角 toast，不擋下一筆輸入
 * - 設定、錢包、分類儲存用置中小視窗，1.2 秒自動關
 * - 刪除前用確認視窗
 */
const base = Swal.mixin({
  buttonsStyling: false,
  customClass: {
    popup: 'swal-glass',
    title: 'swal-title',
    htmlContainer: 'swal-text',
    confirmButton: 'btn-primary min-w-24',
    cancelButton: 'btn-ghost min-w-24',
    actions: 'gap-2',
  },
})

const toast = base.mixin({
  toast: true,
  position: 'top',
  showConfirmButton: false,
  timer: 1800,
  timerProgressBar: true,
})

/** 記帳成功之類的輕提示 */
export function toastSaved(title: string, text?: string) {
  return toast.fire({ icon: 'success', title, text, iconColor: '#7f9a1c' })
}

/** 儲存成功（置中、自動關閉） */
export function alertSaved(title = '已儲存', text?: string) {
  return base.fire({
    icon: 'success',
    title,
    text,
    iconColor: '#7f9a1c',
    showConfirmButton: false,
    timer: 1200,
  })
}

/** 儲存失敗 */
export function alertError(text: string, title = '儲存失敗') {
  return base.fire({ icon: 'error', title, text, iconColor: '#e2531c', confirmButtonText: '知道了' })
}

/** 一般確認（非刪除），按確認鈕才回傳 true；html 可放條列說明 */
export async function confirmAction(title: string, html: string, confirmText = '確定'): Promise<boolean> {
  const result = await base.fire({
    icon: 'question',
    title,
    html,
    iconColor: '#e3a50b',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: '取消',
    reverseButtons: true,
  })
  return result.isConfirmed
}

/** 刪除前確認，按「刪除」才回傳 true */
export async function confirmDelete(title: string, text?: string): Promise<boolean> {
  const result = await base.fire({
    icon: 'warning',
    title,
    text,
    iconColor: '#e3a50b',
    showCancelButton: true,
    confirmButtonText: '刪除',
    cancelButtonText: '取消',
    reverseButtons: true,
    focusCancel: true,
    customClass: {
      popup: 'swal-glass',
      title: 'swal-title',
      htmlContainer: 'swal-text',
      confirmButton: 'btn-danger min-w-24',
      cancelButton: 'btn-ghost min-w-24',
      actions: 'gap-2',
    },
  })
  return result.isConfirmed
}
