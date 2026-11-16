/**
 * Utilidad centralizada de alertas con SweetAlert2
 * Adaptada al diseño minimalista de Voltio (claro/oscuro)
 */

function getSwalThemeConfig() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    background: isDark ? '#18201c' : '#ffffff',
    color: isDark ? '#eff4f1' : '#17221d',
    confirmButtonColor: '#b9f446',
    cancelButtonColor: isDark ? '#2c3530' : '#e3e5de',
    customClass: {
      popup: 'voltio-swal-popup',
      title: 'voltio-swal-title',
      htmlContainer: 'voltio-swal-text',
      input: 'voltio-swal-input',
      confirmButton: 'voltio-swal-confirm',
      cancelButton: 'voltio-swal-cancel'
    }
  };
}

/**
 * Lanza un aviso de error modal con SweetAlert2
 * @param {string} message - Mensaje descriptivo del error
 * @param {string} [title='Ha ocurrido un error'] - Título del modal
 */
export function showError(message, title = 'Ha ocurrido un error') {
  if (typeof window.Swal === 'undefined') {
    alert(`${title}: ${message}`);
    return Promise.resolve();
  }

  return window.Swal.fire({
    ...getSwalThemeConfig(),
    icon: 'error',
    title,
    text: message || 'Se produjo un error inesperado. Inténtalo de nuevo.',
    confirmButtonText: 'Entendido'
  });
}

/**
 * Lanza un aviso de éxito tipo Toast o Modal con SweetAlert2
 * @param {string} message - Mensaje de éxito
 * @param {string} [title='Operación exitosa'] - Título opcional
 */
export function showSuccess(message, title = '¡Completado!') {
  if (typeof window.Swal === 'undefined') {
    return Promise.resolve();
  }

  return window.Swal.fire({
    ...getSwalThemeConfig(),
    icon: 'success',
    title,
    text: message,
    timer: 2500,
    showConfirmButton: false
  });
}

/**
 * Lanza un diálogo de confirmación con SweetAlert2
 * @param {string} message - Pregunta o advertencia
 * @param {string} [title='¿Estás seguro?'] - Título del diálogo
 * @param {string} [confirmButtonText='Sí, confirmar'] - Texto del botón de confirmación
 * @returns {Promise<boolean>} true si el usuario confirmó
 */
export async function showConfirm(
  message,
  title = '¿Estás seguro?',
  confirmButtonText = 'Sí, confirmar'
) {
  if (typeof window.Swal === 'undefined') {
    return confirm(`${title}\n${message}`);
  }

  const result = await window.Swal.fire({
    ...getSwalThemeConfig(),
    icon: 'warning',
    title,
    text: message,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Cancelar',
    reverseButtons: true
  });

  return Boolean(result.isConfirmed);
}

/**
 * Lanza un diálogo con SweetAlert2 para introducir una nueva contraseña
 * @param {string} userName - Nombre del usuario cuya contraseña se va a resetear
 * @returns {Promise<string|null>} La nueva contraseña o null si se cancela
 */
export async function promptPasswordReset(userName) {
  if (typeof window.Swal === 'undefined') {
    const val = prompt(`Introduce la nueva contraseña para ${userName} (mínimo 6 caracteres):`);
    return val ? val.trim() : null;
  }

  const { value: password } = await window.Swal.fire({
    ...getSwalThemeConfig(),
    title: 'Resetear contraseña',
    text: `Introduce la nueva contraseña para ${userName}`,
    input: 'password',
    inputPlaceholder: 'Mínimo 6 caracteres',
    inputAttributes: {
      minlength: 6,
      autocapitalize: 'off',
      autocorrect: 'off'
    },
    showCancelButton: true,
    confirmButtonText: 'Guardar contraseña',
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    inputValidator: (value) => {
      if (!value || value.trim().length < 6) {
        return 'La contraseña debe tener al menos 6 caracteres';
      }
      return null;
    }
  });

  return password ? password.trim() : null;
}

