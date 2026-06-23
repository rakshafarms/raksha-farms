import { query } from './database.js'
import dotenv from 'dotenv'
dotenv.config()

// Only products with images we actually have in frontend/public/images/
// null = will show a nice fallback on the frontend
const products = [
  // ── Vegetables ─────────────────────────────────────────────────────
  { name: 'Fresh Tomatoes',         category: 'vegetables',  price: 40,  stock: 50,  unit: 'kg',    image_url: null,                             description: 'Farm-fresh juicy red tomatoes, hand-picked daily',                is_featured: true  },
  { name: 'Broccoli',               category: 'vegetables',  price: 80,  stock: 15,  unit: 'kg',    image_url: '/images/broccoli.jpg',           description: 'Fresh green broccoli florets, rich in nutrients',                 is_featured: true  },
  { name: 'Red Onions',             category: 'vegetables',  price: 25,  stock: 80,  unit: 'kg',    image_url: '/images/red-onions.webp',        description: 'Pungent red onions, essential for Indian cooking',                is_featured: false },
  { name: 'Cucumber',               category: 'vegetables',  price: 25,  stock: 45,  unit: 'kg',    image_url: '/images/cucumber.jpg',           description: 'Cool and crisp cucumbers, perfect for salads',                   is_featured: false },
  { name: 'Green Peas',             category: 'vegetables',  price: 60,  stock: 25,  unit: 'kg',    image_url: '/images/green-peas.jpg',         description: 'Fresh green peas, sweet and tender',                             is_featured: false },
  { name: 'Fresh Spinach',          category: 'vegetables',  price: 30,  stock: 40,  unit: 'bunch', image_url: null,                             description: 'Tender green spinach leaves, rich in iron',                      is_featured: false },
  { name: 'Carrots',                category: 'vegetables',  price: 35,  stock: 60,  unit: 'kg',    image_url: null,                             description: 'Crunchy orange carrots, naturally sweet',                         is_featured: false },
  { name: 'Potatoes',               category: 'vegetables',  price: 20,  stock: 100, unit: 'kg',    image_url: null,                             description: 'Fresh farm potatoes',                                            is_featured: false },
  { name: 'Green Beans',            category: 'vegetables',  price: 45,  stock: 30,  unit: 'kg',    image_url: null,                             description: 'Fresh tender green beans',                                       is_featured: false },

  // ── Fruits ─────────────────────────────────────────────────────────
  { name: 'Alphonso Mangoes',       category: 'fruits',      price: 120, stock: 25,  unit: 'kg',    image_url: '/images/alphonso-mangoes.jpg',   description: 'King of fruits — sweet Alphonso mangoes from Ratnagiri',         is_featured: true  },
  { name: 'Watermelon',             category: 'fruits',      price: 30,  stock: 15,  unit: 'kg',    image_url: '/images/watermelon.jpg',         description: 'Juicy summer watermelon, naturally sweet',                        is_featured: false },
  { name: 'Kashmir Apples',         category: 'fruits',      price: 150, stock: 20,  unit: 'kg',    image_url: null,                             description: 'Crispy red apples from the valleys of Kashmir',                  is_featured: true  },
  { name: 'Bananas',                category: 'fruits',      price: 40,  stock: 50,  unit: 'dozen', image_url: null,                             description: 'Ripe yellow bananas, energy-packed',                             is_featured: false },
  { name: 'Strawberries',           category: 'fruits',      price: 80,  stock: 20,  unit: '250g',  image_url: null,                             description: 'Fresh red strawberries, sweet and juicy',                        is_featured: false },

  // ── Wood-Pressed Oils ───────────────────────────────────────────────
  { name: 'Ground Nut Oil',         category: 'oils',        price: 180, stock: 30,  unit: 'litre', image_url: '/images/groundnut-oil.webp',     description: 'Cold-pressed groundnut oil, rich in nutrients',                  is_featured: true  },
  { name: 'Sesame Oil',             category: 'oils',        price: 220, stock: 20,  unit: 'litre', image_url: '/images/sesame-oil.jpg',         description: 'Pure wood-pressed sesame oil with nutty aroma',                  is_featured: false },
  { name: 'Virgin Coconut Oil',     category: 'oils',        price: 350, stock: 15,  unit: 'litre', image_url: '/images/virgin-coconut-oil.webp',description: 'Cold-pressed virgin coconut oil, pure and natural',              is_featured: false },
  { name: 'Mustard Oil',            category: 'oils',        price: 160, stock: 25,  unit: 'litre', image_url: '/images/mustard-oil.jpg',        description: 'Pure wood-pressed mustard oil, pungent and healthy',             is_featured: false },

  // ── Microgreens ─────────────────────────────────────────────────────
  { name: 'Microgreens Mix',        category: 'microgreens', price: 120, stock: 20,  unit: '100g',  image_url: '/images/micro-greens.webp',      description: 'Mixed microgreens — sunflower, pea shoots, radish',              is_featured: true  },
  { name: 'Sunflower Microgreens',  category: 'microgreens', price: 100, stock: 15,  unit: '100g',  image_url: '/images/micro-greens.webp',      description: 'Crunchy sunflower microgreens with a nutty flavour',             is_featured: false },

  // ── Mushrooms ───────────────────────────────────────────────────────
  { name: 'Button Mushrooms',       category: 'mushrooms',   price: 80,  stock: 20,  unit: '250g',  image_url: '/images/button-mushroom.webp',   description: 'Fresh white button mushrooms',                                   is_featured: false },
  { name: 'Oyster Mushrooms',       category: 'mushrooms',   price: 100, stock: 15,  unit: '250g',  image_url: '/images/oyster-mushroom.webp',   description: 'Delicate oyster mushrooms, great for stir-fry',                  is_featured: false },
  { name: 'Shiitake Mushrooms',     category: 'mushrooms',   price: 150, stock: 10,  unit: '250g',  image_url: '/images/shiitake-mushrooms.jpg', description: 'Earthy shiitake mushrooms, rich in umami flavour',               is_featured: false },

  // ── Whole Grains ────────────────────────────────────────────────────
  { name: 'Aged Basmati Rice',      category: 'grains',      price: 120, stock: 50,  unit: 'kg',    image_url: '/images/aged-basmati-rice.webp', description: 'Aged long-grain basmati rice, fragrant and aromatic',            is_featured: true  },
  { name: 'Brown Rice',             category: 'grains',      price: 90,  stock: 40,  unit: 'kg',    image_url: '/images/brown-rice.jpg',         description: 'Whole grain brown rice, high in fibre',                          is_featured: false },
  { name: 'Black Wheat',            category: 'grains',      price: 80,  stock: 30,  unit: 'kg',    image_url: '/images/black-wheat.jpg',        description: 'Rare black wheat, rich in antioxidants',                         is_featured: false },

  // ── Millets ─────────────────────────────────────────────────────────
  { name: 'Pearl Millet (Bajra)',   category: 'millets',     price: 60,  stock: 50,  unit: 'kg',    image_url: '/images/pearl-millet.webp',      description: 'Nutritious pearl millet, high in iron and fibre',                is_featured: false },
  { name: 'Finger Millet (Ragi)',   category: 'millets',     price: 70,  stock: 40,  unit: 'kg',    image_url: '/images/finger-millet.webp',     description: 'Calcium-rich finger millet, great for health',                   is_featured: false },
  { name: 'Foxtail Millet',         category: 'millets',     price: 80,  stock: 30,  unit: 'kg',    image_url: '/images/foxtail-millet.webp',    description: 'Protein-rich foxtail millet',                                    is_featured: false },
  { name: 'Little Millet',          category: 'millets',     price: 90,  stock: 25,  unit: 'kg',    image_url: '/images/little-millet.jpg',      description: 'Wholesome little millet, easy to digest',                        is_featured: false },

  // ── Eggs ────────────────────────────────────────────────────────────
  { name: 'Country Eggs (Desi)',    category: 'eggs',        price: 12,  stock: 100, unit: 'piece', image_url: '/images/country-eggs-desi.jpg',  description: 'Free-range country eggs, rich yellow yolk',                      is_featured: true  },
  { name: 'Farm Eggs',              category: 'eggs',        price: 8,   stock: 150, unit: 'piece', image_url: '/images/eggs.jpg',              description: 'Fresh farm eggs, delivered daily',                               is_featured: false },
  { name: 'Quail Eggs',             category: 'eggs',        price: 5,   stock: 80,  unit: 'piece', image_url: '/images/quail-eggs.jpg',        description: 'Nutritious quail eggs, rich in protein',                         is_featured: false },

  // ── Stone-Ground Flours ─────────────────────────────────────────────
  { name: 'Whole Wheat Flour',      category: 'flours',      price: 55,  stock: 60,  unit: 'kg',    image_url: '/images/whole-wheat-flour.jpg',  description: 'Stone-ground whole wheat flour, fresh and nutritious',           is_featured: false },
  { name: 'Jowar Flour',            category: 'flours',      price: 65,  stock: 40,  unit: 'kg',    image_url: '/images/jowar-flour.jpg',        description: 'Gluten-free jowar (sorghum) flour',                              is_featured: false },
  { name: 'Ragi Flour',             category: 'flours',      price: 75,  stock: 35,  unit: 'kg',    image_url: '/images/ragi-flour.webp',        description: 'Calcium-rich ragi (finger millet) flour',                        is_featured: false },
  { name: 'Rice Flour',             category: 'flours',      price: 50,  stock: 50,  unit: 'kg',    image_url: '/images/rice-flour.jpg',         description: 'Fine rice flour for dosas, idlis, and sweets',                   is_featured: false },
]

async function reseed() {
  // Safety guard — this script DELETEs every product. Never let it run
  // against production by accident; require an explicit opt-in env var.
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== 'true') {
    console.error('❌ Refusing to run: NODE_ENV=production. This would DELETE all live products.')
    console.error('   If you really mean to wipe production, re-run with FORCE_SEED=true.')
    process.exit(1)
  }
  console.log('🧹 Clearing old products...')
  try {
    // Remove old products (cascade removes subscriptions/inventory_logs)
    await query(`DELETE FROM products`)
    console.log('✅ Old products cleared')

    console.log('🌱 Seeding fresh products...')
    let count = 0
    for (const p of products) {
      await query(
        `INSERT INTO products (name, category, description, price, stock, unit, image_url, is_featured, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
        [p.name, p.category, p.description, p.price, p.stock, p.unit, p.image_url, p.is_featured]
      )
      count++
    }
    console.log(`✅ Seeded ${count} products successfully`)
    process.exit(0)
  } catch (err) {
    console.error('❌ Reseed failed:', err.message)
    process.exit(1)
  }
}

reseed()
