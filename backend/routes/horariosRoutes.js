const express = require('express');
const router = express.Router();
const horariosController = require('../controllers/horariosController');

router.post('/', horariosController.crearHorario);
router.get('/', horariosController.obtenerHorarios);

module.exports = router;