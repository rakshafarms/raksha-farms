import { Router } from 'express'
import { register, login, adminLogin, me, changePassword, googleAuth, logout } from '../controllers/authController.js'
import { verifyToken } from '../middleware/auth.js'
const r = Router()
r.post('/register',       register)
r.post('/login',          login)
r.post('/admin-login',    adminLogin)
r.post('/google',         googleAuth)
r.post('/logout',         verifyToken, logout)
r.get('/me',              verifyToken, me)
r.put('/change-password', verifyToken, changePassword)
export default r
