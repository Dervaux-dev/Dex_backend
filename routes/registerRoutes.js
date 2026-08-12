//create register routes
const express = require('express');
const router = express.Router();
const { registerUser } = require('../controllers/registerController');
const { validateUserRegistration } = require('../utils/validation');

//register user
router.post('/', validateUserRegistration, registerUser);

//export register routes
module.exports = router;
