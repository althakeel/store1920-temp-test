'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'

export default function AnimatedProgressTracker({ steps }) {
  const [animatedSteps, setAnimatedSteps] = useState([])

  useEffect(() => {
    setAnimatedSteps([])
    // Animate each step sequentially
    steps.forEach((_, idx) => {
      setTimeout(() => {
        setAnimatedSteps((prev) => [...prev, idx])
      }, idx * 150)
    })
  }, [steps])

  const getStepColor = (stepName) => {
    const name = String(stepName || '').toLowerCase()
    if (name.includes('delivered')) return 'from-green-400 to-green-600'
    if (name.includes('out') || name.includes('dispatch')) return 'from-blue-400 to-blue-600'
    if (name.includes('packed') || name.includes('pickup')) return 'from-teal-400 to-teal-600'
    if (name.includes('warehouse') || name.includes('processing')) return 'from-purple-400 to-purple-600'
    if (name.includes('picked') || name.includes('confirmed')) return 'from-indigo-400 to-indigo-600'
    if (name.includes('placed') || name.includes('ordered')) return 'from-slate-400 to-slate-600'
    return 'from-slate-400 to-slate-600'
  }

  if (steps.length === 0) {
    return null
  }

  const activeIndex = Math.max(0, steps.findIndex((step) => step.active))
  const progressRatio = steps.length > 1 ? activeIndex / (steps.length - 1) : 0

  return (
    <div className="w-full">
      {/* Desktop view - horizontal */}
      <div className="hidden sm:block">
        <div className="relative">
          {/* Connection line with gradient */}
          <div className="absolute left-8 right-8 top-5 h-0.5 bg-slate-200" />

          {/* Animated filled line */}
          {animatedSteps.length > 0 && (
            <div
              className="absolute left-8 top-5 h-0.5 bg-blue-500 transition-all duration-1000"
              style={{
                width: `calc((100% - 4rem) * ${progressRatio})`,
              }}
            />
          )}

          {/* Steps */}
          <div className="flex justify-between relative z-10">
            {steps.map((step, idx) => {
              const isAnimated = animatedSteps.includes(idx)
              const isCompleted = step.completed
              const isActive = step.active
              const bgGradient = getStepColor(step.name)

              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center transition-all duration-500 ${
                    isAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-white shadow-sm transition-all duration-300 ${
                      isCompleted
                        ? `bg-gradient-to-br ${bgGradient}`
                        : 'bg-slate-100 text-slate-400'
                    } ${isActive && isAnimated ? 'ring-4 ring-blue-300 ring-offset-2' : ''}`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="text-white" size={20} strokeWidth={2.5} />
                    ) : (
                      <Circle className="text-slate-400" size={18} />
                    )}
                  </div>
                  <p
                    className={`mt-3 max-w-[96px] text-center text-xs font-semibold leading-snug transition-all duration-300 ${
                      isCompleted ? 'text-slate-800' : 'text-slate-400'
                    }`}
                  >
                    {step.name.replace(/_/g, ' ')}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Mobile view - vertical */}
      <div className="block sm:hidden space-y-4">
        {steps.map((step, idx) => {
          const isAnimated = animatedSteps.includes(idx)
          const isCompleted = step.completed
          const isActive = step.active

          return (
            <div key={idx} className={`flex items-start gap-4 transition-all duration-500 ${
              isAnimated ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
            }`}>
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isCompleted || isAnimated
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-white border-slate-300 text-slate-400'
                } ${isActive && isAnimated ? 'ring-2 ring-green-400' : ''}`}
              >
                {isCompleted || isAnimated ? (
                  <CheckCircle2 size={20} strokeWidth={2.5} />
                ) : (
                  <span className="text-sm font-bold">{idx + 1}</span>
                )}
              </div>
              <div className="flex-1 pt-1">
                <p className={`font-semibold text-sm ${
                  isCompleted || isAnimated ? 'text-slate-800' : 'text-slate-400'
                }`}>
                  {step.name.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
