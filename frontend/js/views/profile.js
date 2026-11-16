import { requireAuth } from '../guards/authGuard.js';
import { storage } from '../utils/storage.js';
import { authApi } from '../api/auth.api.js';
import { initTheme, toggleTheme } from '../utils/theme.js';
import { setupUserMenu } from '../utils/userMenu.js';
import { showError } from '../utils/alerts.js';

if (requireAuth()) {
  initTheme();
  setupUserMenu();

  // Elementos de la vista
  const bannerAvatar = document.getElementById('profile-banner-avatar');
  const bannerName = document.getElementById('profile-banner-name');
  const bannerEmail = document.getElementById('profile-banner-email');

  const vehicleBrandDisplay = document.getElementById('vehicle-brand-display');
  const vehicleModelDisplay = document.getElementById('vehicle-model-display');
  const vehiclePlateDisplay = document.getElementById('vehicle-plate-display');

  const infoEmailDisplay = document.getElementById('info-email-display');
  const infoRoleDisplay = document.getElementById('info-role-display');
  const infoClassDisplay = document.getElementById('info-class-display');

  // Modal y formulario
  const modal = document.getElementById('edit-profile-modal');
  const modalAlert = document.getElementById('profile-modal-alert');
  const form = document.getElementById('edit-profile-form');

  const editName = document.getElementById('edit-name');
  const editBrand = document.getElementById('edit-brand');
  const editModel = document.getElementById('edit-model');
  const editPlate = document.getElementById('edit-plate');
  const editClass = document.getElementById('edit-class');
  const editPassword = document.getElementById('edit-password');

  const btnOpenModal = document.getElementById('btn-open-edit-profile');
  const btnEditVehicle = document.getElementById('btn-edit-vehicle');
  const btnCloseModal = document.getElementById('btn-close-profile-modal');
  const btnCancelModal = document.getElementById('btn-cancel-profile-modal');
  const btnSave = document.getElementById('btn-save-profile');

  // Ajustes
  const btnSwitchTheme = document.getElementById('btn-switch-theme');
  if (btnSwitchTheme) {
    btnSwitchTheme.addEventListener('click', () => {
      toggleTheme();
    });
  }

  const toggleNotif = document.getElementById('toggle-notifications');
  if (toggleNotif) {
    toggleNotif.addEventListener('click', () => {
      toggleNotif.classList.toggle('on');
    });
  }

  // Logout del topbar
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      storage.clear();
      window.location.href = 'login.html';
    });
  }

  let currentUserData = null;

  function renderProfileData(user) {
    if (!user) return;
    currentUserData = user;

    // Avatar con iniciales
    const initials = user.name
      ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
      : 'U';
    if (bannerAvatar) {
      bannerAvatar.innerHTML = `${initials}<span></span>`;
    }

    if (bannerName) bannerName.textContent = user.name || 'Usuario';
    if (bannerEmail) bannerEmail.textContent = `${user.email} · Rol: ${user.role}`;

    if (vehicleBrandDisplay) vehicleBrandDisplay.textContent = user.vehicle_brand || 'Marca no definida';
    if (vehicleModelDisplay) vehicleModelDisplay.textContent = user.vehicle_model || 'Modelo no especificado';
    if (vehiclePlateDisplay) vehiclePlateDisplay.textContent = user.vehicle_plate || 'Sin matrícula';

    if (infoEmailDisplay) infoEmailDisplay.textContent = user.email || '--';
    if (infoRoleDisplay) infoRoleDisplay.textContent = (user.role || '--').toUpperCase();
    if (infoClassDisplay) infoClassDisplay.textContent = user.class_name || 'Sin asignar';
  }

  async function loadFreshProfile() {
    try {
      const res = await authApi.getProfile();
      if (res && res.data) {
        const u = res.data;
        // Sincronizar storage local con los datos actualizados
        const local = storage.getUser() || {};
        storage.setUser({ ...local, ...u });
        renderProfileData(u);
      }
    } catch (err) {
      // Usar datos en cache local
      renderProfileData(storage.getUser());
    }
  }

  // Render inicial inmediato con lo que haya en localStorage para evitar parpadeos
  const initialLocalUser = storage.getUser();
  if (initialLocalUser) {
    renderProfileData(initialLocalUser);
  }

  async function loadAvailableClasses() {
    if (!editClass) return;
    try {
      const res = await authApi.getAvailableClasses();
      const list = res.data || [];
      editClass.innerHTML = `
        <option value="">-- Sin clase asignada --</option>
        ${list.map(c => `<option value="${c}">${c}</option>`).join('')}
      `;
    } catch (e) {
      editClass.innerHTML = '<option value="">Error al cargar clases</option>';
    }
  }

  loadAvailableClasses();

  function openEditModal() {
    const userToEdit = currentUserData || storage.getUser() || {};

    editName.value = userToEdit.name || '';
    editBrand.value = userToEdit.vehicle_brand || '';
    editModel.value = userToEdit.vehicle_model || '';
    editPlate.value = userToEdit.vehicle_plate || '';
    if (editClass) editClass.value = userToEdit.class_name || '';
    editPassword.value = '';

    modalAlert.className = 'alert-clean';
    modalAlert.textContent = '';
    modal.style.display = 'flex';
    editName.focus();
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  if (btnOpenModal) btnOpenModal.addEventListener('click', openEditModal);
  if (btnEditVehicle) btnEditVehicle.addEventListener('click', openEditModal);
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Guardar cambios
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      modalAlert.className = 'alert-clean';
      modalAlert.textContent = '';

      const name = editName.value.trim();
      const vehicle_brand = editBrand.value.trim();
      const vehicle_model = editModel.value.trim();
      const vehicle_plate = editPlate.value.trim();
      const class_name = editClass ? editClass.value.trim() : null;
      const password = editPassword.value.trim();

      if (!name) {
        showError('El nombre es obligatorio.', 'Campo requerido');
        return;
      }

      if (password && password.length < 6) {
        showError('La nueva contraseña debe tener mínimo 6 caracteres.', 'Contraseña inválida');
        return;
      }

      btnSave.disabled = true;
      btnSave.textContent = 'Guardando...';

      try {
        const payload = {
          name,
          vehicle_brand,
          vehicle_model,
          vehicle_plate,
          class_name
        };
        if (password) {
          payload.password = password;
        }

        const res = await authApi.updateProfile(payload);
        if (res && res.success) {
          modalAlert.className = 'alert-clean alert-success visible';
          modalAlert.textContent = '¡Perfil actualizado con éxito!';

          // Actualizar storage y vista
          const updated = res.data;
          const local = storage.getUser() || {};
          const merged = { ...local, ...updated };
          storage.setUser(merged);
          renderProfileData(merged);

          setTimeout(() => {
            closeModal();
            setupUserMenu();
          }, 800);
        } else {
          showError(res.message || 'Error al actualizar perfil.', 'Error al guardar');
        }
      } catch (err) {
        showError(err.message || 'Error al conectar con el servidor.', 'Error al guardar');
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Guardar cambios';
      }
    });
  }

  // Cargar datos
  loadFreshProfile();
}

