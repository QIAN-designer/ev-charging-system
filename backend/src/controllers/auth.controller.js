const userService = require('../services/user.service');

const register = async (req, res) => {
  try {
    const { name, email, password, role, vehicle_plate, vehicle_brand, vehicle_model, class_name } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, email y contraseña son obligatorios'
      });
    }

    const data = await userService.register({
      name,
      email,
      password,
      role: role || 'alumno',
      vehicle_plate,
      vehicle_brand,
      vehicle_model,
      class_name
    });

    return res.status(201).json({
      success: true,
      message: 'Usuario registrado con éxito',
      data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error en el registro de usuario'
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son obligatorios'
      });
    }

    const data = await userService.login(email, password);

    return res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error en el inicio de sesión'
    });
  }
};

const me = async (req, res) => {
  try {
    const user = await userService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al recuperar perfil de usuario'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, vehicle_plate, vehicle_brand, vehicle_model, class_name, password } = req.body;
    const updatedUser = await userService.updateProfile(req.user.id, {
      name,
      vehicle_plate,
      vehicle_brand,
      vehicle_model,
      class_name,
      password
    });

    return res.status(200).json({
      success: true,
      message: 'Perfil actualizado con éxito',
      data: updatedUser
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al actualizar perfil'
    });
  }
};

const scheduleService = require('../services/schedule.service');

const getAvailableClasses = async (req, res) => {
  try {
    const classes = await scheduleService.getDistinctClassNames();
    return res.status(200).json({
      success: true,
      data: classes
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al recuperar las clases disponibles'
    });
  }
};

module.exports = {
  register,
  login,
  me,
  updateProfile,
  getAvailableClasses
};

