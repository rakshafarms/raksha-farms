import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

const isProduction = process.env.NODE_ENV === 'production'

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,   // 15s — enough for Render cold-start
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'raksha_farms',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
      }
)

pool.on('error', (err) => {
  console.error('Unexpected DB client error', err)
})

export const query = (text, params) => pool.query(text, params)
export const getClient = () => pool.connect()
export default pool
