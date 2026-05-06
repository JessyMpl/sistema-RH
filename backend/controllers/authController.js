const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Función secreta para registrar a nuestro primer usuario administrador
const registrarUsuario = async (req, res) => {
    try {
        const { nombre, email, password, rol } = req.body;

        // Encriptamos la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Guardamos en la BD
        const nuevoUsuario = await prisma.usuario.create({
            data: {
                nombre,
                email,
                password: hashedPassword,
                rol: rol || 'RH'
            }
        });

        res.status(201).json({ mensaje: "Usuario creado con éxito" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al registrar usuario" });
    }
};

// Función principal de Login (La que usará Vue)
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Buscamos si el correo existe en la BD
        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        // 2. Comparamos la contraseña que escribió con la encriptada en la BD
        const passwordValida = await bcrypt.compare(password, usuario.password);
        if (!passwordValida) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        // 3. Si todo está bien, le creamos su gafete virtual (Token)
        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol }, 
            "SECRETO_SISTEMA_RH_2026", // Esta es la firma de tu sistema
            { expiresIn: '8h' } // El gafete dura 8 horas (una jornada laboral)
        );

        res.json({
            mensaje: "¡Bienvenida al Sistema RH!",
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error en el servidor al intentar iniciar sesión" });
    }
};

module.exports = {
    registrarUsuario,
    login
};