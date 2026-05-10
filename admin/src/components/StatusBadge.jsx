export default function StatusBadge({ status }) {
  const map = {
    placed:           'bg-blue-100   text-blue-700',
    accepted:         'bg-yellow-100 text-yellow-700',
    preparing:        'bg-orange-100 text-orange-600',
    out_for_delivery: 'bg-purple-100 text-purple-700',
    delivered:        'bg-green-100  text-green-700',
    cancelled:        'bg-amber-100  text-amber-700',
    rejected:         'bg-red-100    text-red-700',
  }
  const labels = {
    placed:           'Placed',
    accepted:         'Accepted',
    preparing:        'Preparing',
    out_for_delivery: 'Out for Delivery',
    delivered:        'Delivered',
    cancelled:        'Cancelled',   // customer-initiated
    rejected:         'Rejected',    // admin-initiated
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  )
}
