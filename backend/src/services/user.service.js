const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const VALID_ROLES = ['alumno', 'profesor', 'admin'];

class UserService {
  /**
   * Determina el rol según el dominio institucional:
   * - Si termina en @alu.edu.gva.es -> 'alumno'
   * - Si termina en @edu.gva.es -> 'profesor'
   * - Cualquier otro dominio no está permitido
   */
  resolveRoleFromEmail(email) {
    const normalized = email.trim().toLowerCase();
    if (normalized.endsWith('@alu.edu.gva.es')) {
      return 'alumno';
    }
    if (normalized.endsWith('@edu.gva.es')) {
      return 'profesor';
    }
    const error = new Error('Solo se permiten correos institucionales de la Generalitat Valenciana (@alu.edu.gva.es para alumnos o @edu.gva.es para profesores).');
    error.status = 400;
    throw error;
  }

  async register({ name, email, password, role = null, vehicle_plate = null, vehicle_brand = null, vehicle_model = null, class_name = null }) {
    const normalizedEmail = email.trim().toLowerCase();

    // Asignación automática de rol basada estrictamente en el dominio del email
    const assignedRole = this.resolveRoleFromEmail(normalizedEmail);

    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      const error = new Error('El correo electrónico ya está registrado');
      error.status = 409;
      throw error;
    }

    const hashedPassword = await argon2.hash(password);

    const result = await db.query(
      `INSERT INTO users (name, email, password, role, vehicle_plate, vehicle_brand, vehicle_model, class_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, email, role, vehicle_plate, vehicle_brand, vehicle_model, class_name, created_at`,
      [name, normalizedEmail, hashedPassword, assignedRole, vehicle_plate, vehicle_brand, vehicle_model, assignedRole === 'alumno' ? class_name : null]
    );

    const user = result.rows[0];
    const token = this.generateToken(user);

    return { user, token };
  }

  async login(email, password) {
    const normalizedEmail = email.trim().toLowerCase();

    const result = await db.query(
      'SELECT id, name, email, password, role, vehicle_plate, vehicle_brand, vehicle_model, class_name FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      const error = new Error('Credenciales inválidas');
      error.status = 401;
      throw error;
    }

    const user = result.rows[0];
    const isMatch = await argon2.verify(user.password, password).catch(() => false);

    if (!isMatch) {
      const error = new Error('Credenciales inválidas');
      error.status = 401;
      throw error;
    }

    delete user.password;
    const token = this.generateToken(user);

    return { user, token };
  }

  async getUserById(id) {
    const result = await db.query(
      'SELECT id, name, email, role, vehicle_plate, vehicle_brand, vehicle_model, class_name, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async updateProfile(id, { name, vehicle_plate, vehicle_brand, vehicle_model, class_name, password }) {
    let query = 'UPDATE users SET name = COALESCE($1, name), vehicle_plate = COALESCE($2, vehicle_plate), vehicle_brand = COALESCE($3, vehicle_brand), vehicle_model = COALESCE($4, vehicle_model), class_name = COALESCE($5, class_name)';
    const params = [name || null, vehicle_plate || null, vehicle_brand || null, vehicle_model || null, class_name || null];

    if (password && password.trim().length >= 6) {
      const hashedPassword = await argon2.hash(password);
      params.push(hashedPassword);
      query += `, password = $${params.length}`;
    }

    params.push(id);
    query += ` WHERE id = $${params.length} RETURNING id, name, email, role, vehicle_plate, vehicle_brand, vehicle_model, class_name, created_at`;

    const result = await db.query(query, params);
    if (result.rows.length === 0) {
      const error = new Error('Usuario no encontrado');
      error.status = 404;
      throw error;
    }
    return result.rows[0];
  }

  async resetPasswordByAdmin(userId, newPassword) {
    if (!newPassword || newPassword.trim().length < 6) {
      const error = new Error('La nueva contraseña debe tener al menos 6 caracteres');
      error.status = 400;
      throw error;
    }
    const hashedPassword = await argon2.hash(newPassword);
    const result = await db.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, name, email',
      [hashedPassword, userId]
    );
    if (result.rows.length === 0) {
      const error = new Error('Usuario no encontrado');
      error.status = 404;
      throw error;
    }
    return result.rows[0];
  }

  async getAllUsers() {
    const result = await db.query(
      'SELECT id, name, email, role, vehicle_plate, vehicle_brand, vehicle_model, class_name, created_at FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async updateUserRole(userId, newRole) {
    if (!VALID_ROLES.includes(newRole)) {
      throw new Error(`Rol no válido. Permitidos: ${VALID_ROLES.join(', ')}`);
    }

    const result = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, vehicle_plate',
      [newRole, userId]
    );

    if (result.rows.length === 0) {
      const error = new Error('Usuario no encontrado');
      error.status = 404;
      throw error;
    }

    return result.rows[0];
  }

  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET || 'supersecretkey_ev_charging_2026',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
  }
}

module.exports = new UserService();

