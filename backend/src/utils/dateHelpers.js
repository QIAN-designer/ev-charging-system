/**
 * Comprueba si dos intervalos de tiempo se solapan
 * [startA, endA] y [startB, endB]
 */
const areIntervalsOverlapping = (startA, endA, startB, endB) => {
    const sA = new Date(startA).getTime();
    const eA = new Date(endA).getTime();
    const sB = new Date(startB).getTime();
    const eB = new Date(endB).getTime();

    return sA < eB && sB < eA;
};

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
    areIntervalsOverlapping,
    isFutureDate,
    getDurationInHours,
};
