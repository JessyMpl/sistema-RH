const prisma = require('../config/db');

const crearHorario = async (req, res) => {
    try {
        const { nombre, horaEntrada, horaSalida } = req.body;
        const nuevoHorario = await prisma.horario.create({
            data: { nombre, horaEntrada, horaSalida }
        });
        res.status(201).json({ mensaje: "Horario creado", horario: nuevoHorario });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al crear el horario" });
    }
};

const obtenerHorarios = async (req, res) => {
    try {
        const horarios = await prisma.horario.findMany(); 
        res.json(horarios);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Hubo un error al obtener los horarios" });
    }
};

module.exports = {
    crearHorario,
    obtenerHorarios
};