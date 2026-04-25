type ToastLevel = 'error' | 'success' | 'info';

export function showToast(message: string, level: ToastLevel = 'error') {
  document.dispatchEvent(new CustomEvent('zen:toast', { detail: { message, level } }));
}

export const showError   = (msg: string) => showToast(msg, 'error');
export const showSuccess = (msg: string) => showToast(msg, 'success');
export const showInfo    = (msg: string) => showToast(msg, 'info');
