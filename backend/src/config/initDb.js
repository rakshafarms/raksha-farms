import bcrypt from 'bcryptjs'
import { query } from './database.js'

// Called automatically on server startup — safe to run multiple times (IF NOT EXISTS)
export async function initDb() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        email       VARCHAR(150) UNIQUE NOT NULL,
        phone       VARCHAR(15),
        password    VARCHAR(255) NOT NULL,
        role        VARCHAR(10) DEFAULT 'user' CHECK (role IN ('user','admin')),
        address     TEXT,
        is_active   BOOLEAN DEFAULT true,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(200) NOT NULL,
        category    VARCHAR(50) NOT NULL,
        description TEXT,
        price       DECIMAL(10,2) NOT NULL,
        offer_price DECIMAL(10,2) DEFAULT NULL,
        stock       INTEGER DEFAULT 0,
        unit        VARCHAR(20),
        image_url   VARCHAR(500),
        variants    JSONB DEFAULT '[]',
        is_active   BOOLEAN DEFAULT true,
        is_featured BOOLEAN DEFAULT false,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
        items           JSONB NOT NULL,
        subtotal        DECIMAL(10,2) NOT NULL,
        delivery_fee    DECIMAL(10,2) DEFAULT 0,
        discount        DECIMAL(10,2) DEFAULT 0,
        total           DECIMAL(10,2) NOT NULL,
        status          VARCHAR(30) DEFAULT 'placed',
        payment_method  VARCHAR(20) DEFAULT 'cod',
        payment_status  VARCHAR(20) DEFAULT 'pending',
        address         JSONB,
        coupon_code     VARCHAR(20),
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code            VARCHAR(20) UNIQUE NOT NULL,
        type            VARCHAR(10) DEFAULT 'percent' CHECK (type IN ('percent','flat')),
        value           DECIMAL(10,2) NOT NULL,
        min_order       DECIMAL(10,2) DEFAULT 0,
        max_discount    DECIMAL(10,2),
        max_uses        INTEGER DEFAULT 100,
        used_count      INTEGER DEFAULT 0,
        expires_at      TIMESTAMPTZ,
        is_active       BOOLEAN DEFAULT true,
        description     VARCHAR(200),
        first_order_only BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    // Add new coupon columns to existing DBs (safe — idempotent)
    await query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_discount DECIMAL(10,2)`).catch(()=>{})
    await query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description VARCHAR(200)`).catch(()=>{})
    await query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS first_order_only BOOLEAN DEFAULT false`).catch(()=>{})

    // Subscription plans — defined by admin (daily, weekly, monthly, custom, etc.)
    await query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(100) NOT NULL,
        frequency       VARCHAR(30) NOT NULL,
        frequency_days  INTEGER,
        base_price      DECIMAL(10,2) NOT NULL,
        margin_percent  DECIMAL(5,2) DEFAULT 0,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        description     TEXT,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Customer subscriptions — active subscriptions to plans
    await query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        plan_id         UUID REFERENCES subscription_plans(id) ON DELETE CASCADE,
        items           JSONB NOT NULL DEFAULT '[]',
        price_per_cycle DECIMAL(10,2) NOT NULL,
        frequency       VARCHAR(30) NOT NULL,
        next_delivery   DATE,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS inventory_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
        change      INTEGER NOT NULL,
        reason      VARCHAR(100),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Cart table for cross-device sync
    await query(`
      CREATE TABLE IF NOT EXISTS carts (
        user_id  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        items    JSONB DEFAULT '[]',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Wishlist table for cross-device sync
    await query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        items      JSONB DEFAULT '[]',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Add offer_price to existing products table if missing
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_price DECIMAL(10,2) DEFAULT NULL`)

    // Categories table — admin-managed, drives the frontend category grid
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id         SERIAL PRIMARY KEY,
        slug       VARCHAR(50) UNIQUE NOT NULL,
        name       VARCHAR(100) NOT NULL,
        emoji      VARCHAR(10) DEFAULT '🌿',
        color      VARCHAR(20) DEFAULT '#22c55e',
        tagline    VARCHAR(150) DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        is_active  BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Seed default subscription plans if table is empty
    const { rows: planCount } = await query('SELECT COUNT(*) FROM subscription_plans')
    if (parseInt(planCount[0].count) === 0) {
      const plans = [
        ['Daily Fresh', 'daily', 1, 0, 0, 5, 'Get fresh produce every day'],
        ['Weekly Bundle', 'weekly', 7, 0, 0, 10, 'Best savings - 10% off weekly orders'],
        ['Bi-Weekly', 'bi-weekly', 14, 0, 0, 8, 'Every other week delivery'],
        ['Monthly Fresh', 'monthly', 30, 0, 0, 15, 'Maximum savings on monthly plans'],
      ]
      for (const [name, freq, days, base, margin, discount, desc] of plans) {
        await query(
          `INSERT INTO subscription_plans (name, frequency, frequency_days, base_price, margin_percent, discount_percent, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [name, freq, days, base, margin, discount, desc]
        )
      }
      console.log('✅ Default subscription plans seeded')
    }

    // Seed default categories if table is empty
    const { rows: catCount } = await query('SELECT COUNT(*) FROM categories')
    if (parseInt(catCount[0].count) === 0) {
      const defaults = [
        ['vegetables','Vegetables','🥦','#16a34a','Farm-fresh picks',1],
        ['fruits','Fruits','🍎','#ef4444','Seasonal goodness',2],
        ['oils','Wood-Pressed Oils','🫙','#d97706','Cold-pressed purity',3],
        ['microgreens','Microgreens','🌱','#65a30d','Subscribe & save',4],
        ['mushrooms','Mushrooms','🍄','#78716c','Gourmet varieties',5],
        ['grains','Whole Grains','🌾','#ca8a04','Ancient superfoods',6],
        ['millets','Millets','🌿','#0d9488','Gluten-free grains',7],
        ['eggs','Eggs & Meat','🥚','#f43f5e','Farm-raised protein',8],
        ['flours','Stone-Ground Flours','🫙','#f97316','Traditional milling',9],
      ]
      for (const [slug,name,emoji,color,tagline,sort_order] of defaults) {
        await query(
          `INSERT INTO categories (slug,name,emoji,color,tagline,sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (slug) DO NOTHING`,
          [slug,name,emoji,color,tagline,sort_order]
        )
      }
      console.log('✅ Default categories seeded')
    }

    // ── subscription_deliveries — per-cycle delivery + payment history ──────
    await query(`
      CREATE TABLE IF NOT EXISTS subscription_deliveries (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
        delivery_date   DATE NOT NULL,
        status          VARCHAR(20) DEFAULT 'pending',
        order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
        payment_status  VARCHAR(20) DEFAULT 'cod_due',
        payment_amount  DECIMAL(10,2),
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {})

    // Migrate subscriptions table — old schema had product_id, new schema uses plan_id + items
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_per_cycle DECIMAL(10,2) NOT NULL DEFAULT 0`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS delivery_count INTEGER DEFAULT 0`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS skipped_count INTEGER DEFAULT 0`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'cod_due'`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS address JSONB`).catch(() => {})
    await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => {})
    // Widen frequency column to support 'bi-weekly' etc
    await query(`ALTER TABLE subscriptions ALTER COLUMN frequency TYPE VARCHAR(30)`).catch(() => {})

    // Fix frequency check constraint — old constraint only allowed daily/weekly/monthly.
    // New system uses: daily, custom, once, interval_N (e.g. interval_5), plus legacy weekly/bi-weekly/monthly.
    await query(`ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_frequency_check`).catch(() => {})
    await query(`
      ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_frequency_check
        CHECK (
          frequency IN ('daily','weekly','bi-weekly','monthly','custom','once')
          OR frequency LIKE 'interval_%'
        )
    `).catch(() => {})

    // ── Bug 4 fix: UNIQUE guard so generateOrders is idempotent ──────────────
    await query(`
      ALTER TABLE subscription_deliveries
        ADD CONSTRAINT IF NOT EXISTS uq_sub_delivery
        UNIQUE (subscription_id, delivery_date)
    `).catch(() => {})

    // Add reference_id column if it doesn't exist (stores the frontend RF-... order ID)
    await query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS reference_id VARCHAR(60)
    `).catch(() => {})

    // Sequential order number — auto-increments across the whole store
    await query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number SERIAL
    `).catch(() => {})

    // delivery_time column for marking actual delivery timestamp
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time TIMESTAMPTZ`).catch(() => {})

    // Soft-delete: admin removes an order from history/totals but keeps the row
    // (with a reason) so it stays visible in the admin list, marked as deleted.
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`).catch(() => {})
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delete_remarks TEXT`).catch(() => {})

    // Organic flag — only products explicitly marked organic show the organic badge
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_organic BOOLEAN DEFAULT false`).catch(() => {})

    // Saved addresses table — allows users to save multiple named addresses
    await query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        label      VARCHAR(30) DEFAULT 'Home',
        name       VARCHAR(100),
        phone      VARCHAR(20),
        address    TEXT,
        city       VARCHAR(100),
        pincode    VARCHAR(10),
        notes      TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {})

    // Remove existing duplicate addresses (keep oldest per user+address+city+pincode+name)
    await query(`
      DELETE FROM user_addresses
      WHERE id NOT IN (
        SELECT DISTINCT ON (user_id, LOWER(TRIM(address)), LOWER(TRIM(city)), LOWER(TRIM(pincode)), LOWER(TRIM(name)))
          id
        FROM user_addresses
        ORDER BY user_id, LOWER(TRIM(address)), LOWER(TRIM(city)), LOWER(TRIM(pincode)), LOWER(TRIM(name)), created_at ASC
      )
    `).catch(() => {})

    // Ensure orders.status allows 'rejected' (old DBs had a CHECK without it)
    await query(`
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check
    `).catch(() => {}) // ignore if constraint doesn't exist
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'orders_status_check' AND conrelid = 'orders'::regclass
        ) THEN
          ALTER TABLE orders ADD CONSTRAINT orders_status_check
            CHECK (status IN ('placed','accepted','preparing','out_for_delivery','delivered','cancelled','rejected'));
        END IF;
      END $$
    `).catch(() => {}) // non-fatal if constraint already has right values

    // Store settings table — key/value pairs for admin-configurable options
    await query(`
      CREATE TABLE IF NOT EXISTS store_settings (
        key        VARCHAR(100) PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {})

    // Seed default delivery fee settings
    await query(`
      INSERT INTO store_settings (key, value) VALUES
        ('free_delivery_threshold', '500'),
        ('delivery_fee_standard', '30'),
        ('delivery_fee_express', '60')
      ON CONFLICT (key) DO NOTHING
    `).catch(() => {})

    // Upsert admin user and sync password with ADMIN_SECRET env var
    // This ensures the backend admin password always matches the frontend VITE_ADMIN_PASSWORD
    const adminSecret = process.env.ADMIN_SECRET || 'raksha@admin2024'
    const hashed = await bcrypt.hash(adminSecret, 10)
    await query(
      `INSERT INTO users (name, email, phone, password, role)
       VALUES ('Admin', 'admin@rakshafarms.in', '9346566945', $1, 'admin')
       ON CONFLICT (email) DO UPDATE SET password = $1`,
      [hashed]
    )

    console.log('✅ DB tables verified')
  } catch (err) {
    console.error('⚠ DB init error:', err.message)
  }
}
