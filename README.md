# Voltio — Sistema de Gestión de Carga EV (`ev-charging-system`)

Sistema web para la gestión, asignación inteligente y control de plazas de carga para vehículos eléctricos en un instituto.

---

## Roles de usuario

- **Alumno:** Consulta su próximo turno asignado, el estado de los cargadores en tiempo real, su historial de reservas, el cuadrante semanal de horarios, su perfil/vehículo y puede reportar incidencias.
- **Profesor:** Mismas capacidades operativas que el alumnado para gestionar sus turnos de carga y reportar avisos.
- **Administrador:** Consola central con gestión de cargadores, reservas globales, directorio de usuarios, importación de horarios lectivos (XML/JSON), algoritmo de reparto equitativo (manual y programado) y bandeja de notificaciones e incidencias.

---

## Funcionalidades principales

- **Panel Personal (`frontend/index.html`):** Vista enfocada en el próximo turno asignado al usuario, progreso de horas de carga acumuladas, datos del vehículo y estado en tiempo real de los puntos de recarga del campus.
- **Mis Reservas (`frontend/reservas.html`):** Detalle de la reserva activa (con opción de cancelación) e historial completo de cargas.
- **Horarios (`frontend/horarios.html`):** Cuadrante semanal de turnos de recarga (lunes a viernes) con navegación entre semanas anteriores y siguientes.
- **Gestión de Incidencias (`frontend/incidencias.html`):** Formulario para notificar vehículos no autorizados ocupando plazas (incluyendo matrícula infractora), cargadores averiados u otros problemas, junto con el seguimiento del estado y la respuesta del administrador.
- **Mi Perfil (`frontend/profile.html`):** Edición de datos personales, vehículo eléctrico (marca, modelo, matrícula), grupo/clase y contraseña.
- **Panel de Administración (`frontend/admin-dashboard.html`):**
  - Estadísticas generales y contador en tiempo real de incidencias pendientes.
  - Bandeja de **Incidencias y Notificaciones** con filtros por estado (`pending`, `in_progress`, `resolved`, `dismissed`) y modal para responder y resolver avisos.
  - Control de cargadores, reservas globales y usuarios.
  - **Reparto Inteligente:** Asignación automática equitativa de turnos según horas lectivas y programación periódica.
  - **Horarios de clases:** Importación de horarios desde XML o JSON.
- **Modo Claro / Oscuro:** Selector de tema persistente en `localStorage` disponible en todas las vistas.

---

## Stack Tecnológico

- **Backend:** Node.js, Express, PostgreSQL (`pg`), Argon2 (`argon2`) para hashing de contraseñas, JWT (`jsonwebtoken`) para autenticación.
- **Frontend:** Vanilla JavaScript (ES6+ modular), HTML5 y CSS3 puro (sin frameworks).

---

## Estructura del proyecto

```text
ev-charging-system/
├── backend/
│   ├── src/
│   │   ├── config/         # Conexión e inicialización de esquema PostgreSQL (db.js)
│   │   ├── controllers/    # Controladores REST (auth, chargers, bookings, incidents, admin)
│   │   ├── middlewares/    # Autenticación JWT y control de roles
│   │   ├── routes/         # Definición de rutas /api/*
│   │   ├── services/       # Lógica de negocio y reparto inteligente
│   │   └── app.js          # Configuración de Express y montaje de rutas
│   ├── .env.example        # Plantilla de variables de entorno
│   ├── package.json
│   ├── seed.js             # Script de carga de alumnos de prueba
│   └── server.js           # Punto de entrada del servidor
└── frontend/
    ├── css/                # Hoja de estilos principal (minimalist.css)
    ├── js/
    │   ├── api/            # Clientes HTTP fetch (client.js, auth, bookings, incidents, admin)
    │   ├── guards/         # Protección de rutas privadas y de administrador
    │   ├── utils/          # Utilidades (tema, menú de usuario, fechas, alertas, almacenamiento)
    │   └── views/          # Lógica de cada vista HTML
    ├── index.html
    ├── login.html
    ├── reservas.html
    ├── horarios.html
    ├── incidencias.html
    ├── profile.html
    └── admin-dashboard.html
```

---

## Instalación y puesta en marcha

### 1. Requisitos previos
- **Node.js** (v18 o superior recomendado)
- **PostgreSQL** (por ejemplo, en contenedor Docker en el puerto `5432`)

### 2. Configurar el Backend
1. Entra en la carpeta del backend e instala las dependencias:
   ```bash
   cd backend
   npm install
   ```
2. Crea el archivo `.env` a partir de `backend/.env.example`:
   ```env
   PORT=3000
   NODE_ENV=development

   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_NAME=ev_charging_db

   JWT_SECRET=supersecretkey_ev_charging_2026
   JWT_EXPIRES_IN=24h
   ```
3. (Opcional) Carga alumnos de prueba en la base de datos:
   ```bash
   node seed.js
   ```
4. Inicia el servidor backend:
   ```bash
   npm run dev
   ```
   El servidor quedará escuchando en `http://localhost:3000` e inicializará automáticamente las tablas necesarias en PostgreSQL al arrancar.

### 3. Ejecutar el Frontend
Abre `frontend/login.html` o `frontend/index.html` mediante un servidor estático local (por ejemplo, **Live Server** en VS Code en el puerto `5500`).

---

## Endpoints principales de la API

- `POST /api/auth/register` y `POST /api/auth/login` — Registro, inicio de sesión y perfil (`/api/auth/me`).
- `GET /api/chargers` — Listado y estado de los puntos de recarga.
- `GET /api/bookings/my`, `GET /api/bookings/weekly`, `PATCH /api/bookings/:id/cancel` — Reservas y cuadrante semanal.
- `POST /api/incidents`, `GET /api/incidents/my` — Creación y consulta de incidencias del usuario.
- `GET /api/incidents/all`, `GET /api/incidents/pending-count`, `PATCH /api/incidents/:id` — Bandeja de notificaciones y resolución (solo administrador).
- `GET /api/admin/*`, `POST /api/admin/*` — Estadísticas, usuarios, horarios y reparto inteligente (solo administrador).
