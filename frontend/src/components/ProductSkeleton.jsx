import React from 'react'

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="h-36 sm:h-44 bg-gray-100 skeleton-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-20 bg-gray-100 rounded skeleton-pulse" />
        <div className="h-4 w-3/4 bg-gray-100 rounded skeleton-pulse" />
        <div className="h-3 w-full bg-gray-100 rounded skeleton-pulse" />
        <div className="flex items-center justify-between pt-2">
          <div className="h-6 w-16 bg-gray-100 rounded skeleton-pulse" />
          <div className="h-9 w-24 bg-gray-100 rounded-xl skeleton-pulse" />
        </div>
      </div>
    </div>
  )
}

export function ProductDetailSkeleton() {
  return (
    <div className="page-enter max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 pb-24 md:pb-10">
      <div className="h-4 w-56 bg-gray-100 rounded mb-6 skeleton-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        <div className="aspect-square rounded-3xl bg-gray-100 skeleton-pulse" />
        <div className="space-y-5">
          <div className="h-6 w-28 bg-gray-100 rounded-full skeleton-pulse" />
          <div className="h-10 w-3/4 bg-gray-100 rounded skeleton-pulse" />
          <div className="h-5 w-40 bg-gray-100 rounded skeleton-pulse" />
          <div className="h-12 w-48 bg-gray-100 rounded skeleton-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-100 rounded skeleton-pulse" />
            <div className="h-4 w-5/6 bg-gray-100 rounded skeleton-pulse" />
            <div className="h-4 w-2/3 bg-gray-100 rounded skeleton-pulse" />
          </div>
          <div className="h-14 w-full bg-gray-100 rounded-2xl skeleton-pulse" />
        </div>
      </div>
    </div>
  )
}
