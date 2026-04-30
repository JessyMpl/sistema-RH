// backend/controllers/horariosController.js
const prisma = require('../config/db');

const crearHorario = async (req, res) => {
    try {
        const { nombre, horaEntrada, horaSalida } = req.body;

        const nuevoHorario = await prisma.horario.create({
            data: {
                nombre,
                horaEntrada,
                horaSalida
            }
        });

        res.status(201).json({
            mensaje: "Horario creado exitosamente",
            horario: nuevoHorario
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Hubo un error al crear el horario" });
    }
};

module.exports = {
    crearHorario
};