import { Router } from 'express'
import {
  getProducts, getProductsAdmin, getProduct,
  createProduct, updateProduct, deleteProduct, hardDeleteProduct,
  updateStock, getLowStock, bulkImportProducts
} from '../controllers/productsController.js'
import { getProductReviews, createReview, deleteReview } from '../controllers/reviewsController.js'
import { adminOnly, optionalAuth } from '../middleware/auth.js'
import { uploadProductImages } from '../middleware/upload.js'

const r = Router()

// Static/named routes MUST come before /:id to avoid being swallowed as a param
r.get('/',                getProducts)
r.get('/low-stock',       ...adminOnly, getLowStock)
r.get('/admin/all',       ...adminOnly, getProductsAdmin)      // all products, any status

// Param routes — after all named routes
r.get('/:id',             getProduct)
r.post('/',               ...adminOnly, uploadProductImages, createProduct)
r.put('/:id',             ...adminOnly, uploadProductImages, updateProduct)
r.patch('/:id/stock',     ...adminOnly, updateStock)
r.post('/bulk-import',    ...adminOnly, bulkImportProducts)    // Excel/CSV bulk update + create
r.delete('/:id',          ...adminOnly, deleteProduct)         // soft delete (archive)
r.delete('/:id/hard',     ...adminOnly, hardDeleteProduct)     // permanent delete

// Reviews & ratings — public read, optional-auth write, admin moderation
r.get('/:id/reviews',              getProductReviews)
r.post('/:id/reviews',             optionalAuth, createReview)
r.delete('/:id/reviews/:reviewId', ...adminOnly, deleteReview)

export default r
