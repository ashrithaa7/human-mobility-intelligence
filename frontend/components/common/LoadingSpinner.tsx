interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  message?: string
}

export function LoadingSpinner({ size = 'md', message }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }[size]

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <div className={`${sizeClass} border-4 border-white/20 border-t-purple-600 rounded-full animate-spin`}></div>
      {message && <p className="text-gray-400">{message}</p>}
    </div>
  )
}