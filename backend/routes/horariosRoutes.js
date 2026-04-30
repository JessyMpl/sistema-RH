// backend/routes/horariosRoutes.js
const express = require('express');
const router = express.Router();
const horariosController = require('../controllers/horariosController');

// Definimos que cuando alguien haga una petición POST a esta ruta, 
// se ejecute la función 'crearHorario' de nuestro controlador
router.post('/', horariosController.crearHorario);

module.exports = router;

