/**
 * Valida si una fecha dada está en el futuro
 */
const isFutureDate = date => {
    return new Date(date).getTime() > Date.now();
};

/**
 * Calcula la duración en horas entre dos fechas
 */
const getDurationInHours = (startDate, endDate) => {
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    return diffMs / (1000 * 60 * 60);
};

module.exports = {
    isFutureDate,
    getDurationInHours,
};
