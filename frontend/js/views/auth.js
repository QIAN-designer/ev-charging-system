import { authApi } from '../api/auth.api.js';
import { storage } from '../utils/storage.js';
import { requireGuest } from '../guards/authGuard.js';
import { showError } from '../utils/alerts.js';
import { initTheme } from '../utils/theme.js';

initTheme();

if (requireGuest()) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');
  const alertBox = document.getElementById('auth-alert');
  const groupClass = document.getElementById('group-reg-class');
  const selectClass = document.getElementById('reg-class');
  const regEmailInput = document.getElementById('reg-email');
  const detectedRoleLabel = document.getElementById('detected-role-label');

  // Detección automática en tiempo real del rol según el dominio institucional
  function detectRoleFromEmail(email) {
    const val = (email || '').trim().toLowerCase();
    if (val.endsWith('@alu.edu.gva.es')) {
      return { role: 'alumno', label: '🎓 Alumno (@alu.edu.gva.es)', valid: true };
    }
    if (val.endsWith('@edu.gva.es')) {
      return { role: 'profesor', label: '👨‍🏫 Profesor (@edu.gva.es)', valid: true };
    }
    if (!val) {
      return { role: null, label: 'Introduce tu correo GVA', valid: false };
    }
    return { role: null, label: '⚠️ Correo no válido (debe ser @alu.edu.gva.es o @edu.gva.es)', valid: false };
  }

  if (regEmailInput && detectedRoleLabel) {
    regEmailInput.addEventListener('input', () => {
      const { role, label, valid } = detectRoleFromEmail(regEmailInput.value);
      detectedRoleLabel.textContent = label;
      detectedRoleLabel.style.color = valid ? 'var(--green-dark)' : 'var(--danger)';

      if (groupClass) {
        // La clase solo se solicita para alumnos
        groupClass.style.display = role === 'alumno' ? 'flex' : 'none';
      }
    });
  }

  // Cargar dinámicamente las clases que existan en la BBDD
  async function loadClassesIntoSelect() {
    if (!selectClass) return;
    try {
      const res = await authApi.getAvailableClasses();
      const classes = res.data || [];
      if (classes.length === 0) {
        selectClass.innerHTML = '<option value="">No hay horarios de clases cargados</option>';
      } else {
        selectClass.innerHTML = `
          <option value="">-- Selecciona tu clase / grupo --</option>
          ${classes.map(c => `<option value="${c}">${c}</option>`).join('')}
        `;
      }
    } catch (e) {
      selectClass.innerHTML = '<option value="">Error al cargar clases</option>';
    }
  }

  loadClassesIntoSelect();

  function showAlert(msg, type = 'danger') {
    if (type === 'danger' || type === 'error') {
      showError(msg, 'Error de autenticación');
      return;
    }
    alertBox.textContent = msg;
    alertBox.className = 'alert-clean alert-success visible';
  }

  function hideAlert() {
    alertBox.className = 'alert-clean';
    alertBox.textContent = '';
  }

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = 'flex';
    formRegister.style.display = 'none';
    hideAlert();
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formLogin.style.display = 'none';
    formRegister.style.display = 'flex';
    hideAlert();
  });

  // Submit Login
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    const btn = document.getElementById('btn-login-submit');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
      const res = await authApi.login(email, password);
      storage.setToken(res.data.token);
      storage.setUser(res.data.user);

      showAlert('¡Inicio de sesión correcto! Redirigiendo...', 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 600);
    } catch (error) {
      showAlert(error.message || 'Error al iniciar sesión');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Iniciar Sesión';
    }
  });

  // Submit Registro
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    const btn = document.getElementById('btn-reg-submit');
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const { role, valid } = detectRoleFromEmail(email);

    if (!valid) {
      showError('Solo se permiten correos institucionales de la Generalitat Valenciana (@alu.edu.gva.es para alumnos o @edu.gva.es para profesores).', 'Dominio de correo no permitido');
      return;
    }

    const class_name = role === 'alumno' ? (document.getElementById('reg-class')?.value.trim() || null) : null;
    const vehicle_brand = document.getElementById('reg-brand')?.value.trim() || null;
    const vehicle_model = document.getElementById('reg-model')?.value.trim() || null;
    const vehicle_plate = document.getElementById('reg-plate').value.trim();

    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    try {
      const res = await authApi.register({
        name,
        email,
        password,
        role,
        class_name,
        vehicle_brand,
        vehicle_model,
        vehicle_plate: vehicle_plate || null
      });

      storage.setToken(res.data.token);
      storage.setUser(res.data.user);

      showAlert('Cuenta creada con éxito. Entrando...', 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 600);
    } catch (error) {
      showAlert(error.message || 'Error al registrar usuario');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Completar Registro';
    }
  });
}
