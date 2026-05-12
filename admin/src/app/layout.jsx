import './globals.css'

export const metadata = {
  title: 'Raksha Farms Admin',
  description: 'Admin Dashboard',
}

// Next.js 13+ – proper way to set viewport so mobile browsers scale correctly
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">{children}</body>
    </html>
  )
}
