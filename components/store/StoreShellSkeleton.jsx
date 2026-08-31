'use client';

export default function StoreShellSkeleton() {
  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden bg-slate-50">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
        <div className="flex gap-2">
          <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden h-full min-h-0 w-56 shrink-0 overflow-hidden border-r border-slate-200 bg-white p-3 lg:block xl:w-64">
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:p-5">
          <div className="animate-pulse space-y-4">
            <div className="h-7 w-48 rounded-lg bg-slate-200" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 rounded-xl border border-slate-200 bg-white" />
              ))}
            </div>
            <div className="h-64 rounded-xl border border-slate-200 bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
