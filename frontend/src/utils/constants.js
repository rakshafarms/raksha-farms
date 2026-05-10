export const FREE_DELIVERY_THRESHOLD = 500
export const DELIVERY_FEE_STANDARD  = 30
export const DELIVERY_FEE_EXPRESS   = 60
export const OWNER_UPI_ID           = 'rakshafarms@upi'
export const OWNER_PHONE            = '9346566945'

export function calcDelivery(subtotal, slotType = 'standard') {
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0
  return slotType === 'express' ? DELIVERY_FEE_EXPRESS : DELIVERY_FEE_STANDARD
}

export const DELIVERY_SLOTS = [
  {
    id: 'express',
    label: 'Express Delivery',
    desc: 'Within 2 hours',
    icon: '⚡',
    fee: DELIVERY_FEE_EXPRESS,
    available: () => {
      const h = new Date().getHours()
      return h >= 7 && h < 18
    },
  },
  {
    id: 'morning',
    label: 'Morning Delivery',
    desc: '7 AM – 10 AM',
    icon: '🌅',
    fee: DELIVERY_FEE_STANDARD,
    available: () => true,
  },
  {
    id: 'evening',
    label: 'Evening Delivery',
    desc: '5 PM – 8 PM',
    icon: '🌆',
    fee: DELIVERY_FEE_STANDARD,
    available: () => true,
  },
]
