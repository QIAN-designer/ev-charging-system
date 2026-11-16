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
  const selectRole = document.getElementById('reg-role');
  const groupClass = document.getElementById('group-reg-class');
  const selectClass = document.getElementById('reg-class');

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

  if (selectRole && groupClass) {
    selectRole.addEventListener('change', () => {
      // Si es profesor o admin, la clase es opcional o puede ocultarse si se prefiere
      if (selectRole.value === 'profesor') {
        groupClass.style.display = 'none';
      } else {
        groupClass.style.display = 'flex';
      }
    });
  }

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
    const role = document.getElementById('reg-role').value;
    const class_name = document.getElementById('reg-class')?.value.trim() || null;
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
