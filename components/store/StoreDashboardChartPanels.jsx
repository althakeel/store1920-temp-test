'use client';

import { memo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CreditCard, Package } from 'lucide-react';
import SafeResponsiveContainer from '@/components/store/SafeResponsiveContainer';

const STATUS_COLORS = {
  processing: '#8B5CF6',
  shipping: '#3B82F6',
  delivered: '#10B981',
  returned: '#F59E0B',
  cancelled: '#EF4444',
};

const STATUS_LIST = [
  { key: 'processing', label: 'Processing' },
  { key: 'shipping', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'returned', label: 'Returned' },
  { key: 'cancelled', label: 'Cancelled' },
];

const RATING_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];
const CHART_ANIMATION = false;

function money(value, currency) {
  return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function Panel({ title, subtitle, children, className = '', accent }) {
  const accents = {
    sky: 'border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-white',
    violet: 'border-violet-100 bg-gradient-to-br from-violet-50/60 via-white to-white',
    emerald: 'border-emerald-100 bg-gradient-to-br from-emerald-50/60 via-white to-white',
    slate: 'border-slate-200 bg-white',
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${accents[accent] || accents.slate} ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SectionHeading({ title, description }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-slate-200/80 pb-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
    </div>
  );
}

function HourlyTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  const orders = payload.find((p) => p.dataKey === 'orders')?.value ?? 0;
  const revenue = payload.find((p) => p.dataKey === 'revenue')?.value ?? 0;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="text-violet-700"><strong>{orders}</strong> orders</p>
      <p className="text-emerald-700"><strong>{money(revenue, currency)}</strong></p>
    </div>
  );
}

function SalesTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  const orders = payload.find((p) => p.dataKey === 'orders')?.value ?? 0;
  const revenue = payload.find((p) => p.dataKey === 'revenue')?.value ?? 0;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="text-violet-700"><strong>{orders}</strong> orders</p>
      <p className="text-emerald-700"><strong>{money(revenue, currency)}</strong></p>
    </div>
  );
}

function StatusTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => Number(p.value) > 0);
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold text-slate-900">{label}</p>
      {rows.map((row) => (
        <div key={row.dataKey} className="flex justify-between gap-3">
          <span>{row.name}</span>
          <strong style={{ color: row.color }}>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ message }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-xl bg-slate-50/80 text-sm text-slate-500">
      <div className="mb-2 h-10 w-10 rounded-full bg-slate-100" />
      {message}
    </div>
  );
}

function StoreDashboardChartPanels({
  currency = 'AED',
  analytics = {},
  totalOrders = 0,
}) {
  const [showDetails, setShowDetails] = useState(false);

  const {
    ordersTrend = [],
    ordersStatusTrend = [],
    statusTotals = {},
    ratingBreakdown = [],
    avgRating = 0,
    ordersThisWeek = 0,
    ordersLastWeek = 0,
    todayHourlyTrend = [],
    paymentMethodBreakdown = [],
    weekComparison = [],
  } = analytics;

  const hourlyData = todayHourlyTrend.length ? todayHourlyTrend : Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    shortLabel: h % 4 === 0 ? `${String(h).padStart(2, '0')}:00` : '',
    orders: 0,
    revenue: 0,
  }));

  const hasTodayActivity = hourlyData.some((d) => d.orders > 0 || d.revenue > 0);
  const weekDelta = ordersThisWeek - ordersLastWeek;
  const weekDeltaPct = ordersLastWeek > 0 ? Math.round((weekDelta / ordersLastWeek) * 100) : null;
  const totalReviews = ratingBreakdown.reduce((sum, row) => sum + row.count, 0);
  const hasSales = ordersTrend.some((d) => d.orders > 0 || d.revenue > 0);
  const hasStatusData = ordersStatusTrend.some((d) => d.total > 0);
  const formatRevenueTick = (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

  const pieData = STATUS_LIST.map((s) => ({
    name: s.label,
    value: statusTotals[s.key] || 0,
    fill: STATUS_COLORS[s.key],
  })).filter((d) => d.value > 0);

  const weekChartData = weekComparison.length
    ? weekComparison
    : [{ period: 'Last week', orders: 0, revenue: 0 }, { period: 'This week', orders: 0, revenue: 0 }];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeading title="Today" description="Hourly paid orders · UAE time" />
        <Panel title="Orders & revenue by hour" subtitle={hasTodayActivity ? 'Bars = orders · line = revenue' : 'Waiting for today\'s first sale'} accent="sky">
          <div className="h-[280px]">
            <SafeResponsiveContainer>
              <ComposedChart data={hourlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="todayOrdersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E2E8F0" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="shortLabel" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="orders" allowDecimals={false} tick={{ fontSize: 10 }} width={24} axisLine={false} tickLine={false} />
                <YAxis yAxisId="revenue" orientation="right" tickFormatter={formatRevenueTick} tick={{ fontSize: 10 }} width={36} axisLine={false} tickLine={false} />
                <Tooltip content={<HourlyTooltip currency={currency} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="orders" isAnimationActive={CHART_ANIMATION} dataKey="orders" name="Orders" fill="url(#todayOrdersGrad)" radius={[6, 6, 0, 0]} maxBarSize={22} />
                <Line yAxisId="revenue" isAnimationActive={CHART_ANIMATION} type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            </SafeResponsiveContainer>
          </div>
        </Panel>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Sales trends" description="30-day performance & week comparison" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="30-day sales" subtitle="Daily orders + revenue" className="lg:col-span-2" accent="violet">
            <div className="h-[280px]">
              {hasSales ? (
                <SafeResponsiveContainer>
                  <ComposedChart data={ordersTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ordersBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#A78BFA" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} minTickGap={18} />
                    <YAxis yAxisId="orders" allowDecimals={false} tick={{ fontSize: 10 }} width={24} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="revenue" orientation="right" tickFormatter={formatRevenueTick} tick={{ fontSize: 10 }} width={36} axisLine={false} tickLine={false} />
                    <Tooltip content={<SalesTooltip currency={currency} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="orders" isAnimationActive={CHART_ANIMATION} dataKey="orders" name="Orders" fill="url(#ordersBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Area yAxisId="revenue" isAnimationActive={CHART_ANIMATION} type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" fill="url(#revenueFill)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </SafeResponsiveContainer>
              ) : (
                <EmptyChart message="Charts light up after your first paid order." />
              )}
            </div>
          </Panel>

          <Panel title="Week vs week" subtitle="Orders & revenue" accent="emerald">
            <div className="mb-2 text-sm">
              <span className={`font-bold ${weekDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {weekDelta >= 0 ? '+' : ''}{weekDelta}
              </span>
              <span className="text-slate-500"> orders</span>
              {weekDeltaPct !== null ? (
                <span className={`ml-1 text-xs font-medium ${weekDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ({weekDeltaPct >= 0 ? '+' : ''}{weekDeltaPct}%)
                </span>
              ) : null}
            </div>
            <div className="h-[230px]">
              <SafeResponsiveContainer>
                <BarChart data={weekChartData} barGap={8}>
                  <CartesianGrid stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar isAnimationActive={CHART_ANIMATION} dataKey="orders" name="Orders" fill="#8B5CF6" radius={[6, 6, 0, 0]} maxBarSize={44} />
                  <Bar isAnimationActive={CHART_ANIMATION} dataKey="revenue" name="Revenue" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </SafeResponsiveContainer>
            </div>
          </Panel>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/80 pb-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">Orders & fulfillment</h2>
            <p className="mt-0.5 text-sm text-slate-500">Pipeline and payment mix</p>
          </div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {showDetails ? 'Hide daily chart' : 'Show daily chart'}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Order status" subtitle="Current pipeline" accent="violet">
            {totalOrders > 0 ? (
              <>
                <div className="h-[180px]">
                  <SafeResponsiveContainer>
                    <PieChart>
                      <Pie isAnimationActive={CHART_ANIMATION} data={pieData.length ? pieData : [{ name: 'Processing', value: 1, fill: STATUS_COLORS.processing }]} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                        {(pieData.length ? pieData : [{ fill: STATUS_COLORS.processing }]).map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value} orders`, name]} />
                    </PieChart>
                  </SafeResponsiveContainer>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {STATUS_LIST.map((s) => (
                    <li key={s.key} className="flex justify-between text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.key] }} />
                        {s.label}
                      </span>
                      <strong>{statusTotals[s.key] || 0}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyChart message="No paid orders yet." />
            )}
          </Panel>

          <Panel title="Payment methods" subtitle="How customers paid" accent="emerald">
            {paymentMethodBreakdown.length > 0 ? (
              <div className="h-[200px]">
                <SafeResponsiveContainer>
                  <PieChart>
                    <Pie isAnimationActive={CHART_ANIMATION} data={paymentMethodBreakdown} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3}>
                      {paymentMethodBreakdown.map((entry) => (
                        <Cell key={entry.method} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name, props) => [`${value} · ${money(props.payload.revenue, currency)}`, name]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </SafeResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[200px] flex-col items-center justify-center text-sm text-slate-500">
                <CreditCard className="mb-2 text-slate-300" size={28} />
                Appears after first paid order.
              </div>
            )}
          </Panel>
        </div>

        {showDetails ? (
          <Panel title="Daily fulfillment (30 days)" subtitle="Stacked by status">
            <div className="h-[280px]">
              {hasStatusData ? (
                <SafeResponsiveContainer>
                  <BarChart data={ordersStatusTrend} barCategoryGap="16%">
                    <CartesianGrid stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={12} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} axisLine={false} tickLine={false} />
                    <Tooltip content={<StatusTooltip />} />
                    {STATUS_LIST.map((s, i) => (
                      <Bar key={s.key} isAnimationActive={CHART_ANIMATION} dataKey={s.key} name={s.label} stackId="status" fill={STATUS_COLORS[s.key]} maxBarSize={30} radius={i === STATUS_LIST.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </SafeResponsiveContainer>
              ) : (
                <EmptyChart message="No fulfillment data yet." />
              )}
            </div>
          </Panel>
        ) : null}
      </section>

      {totalReviews > 0 ? (
        <section className="space-y-4">
          <SectionHeading title="Customer reviews" description={`${avgRating}/5 from ${totalReviews} reviews`} />
          <Panel title="Rating distribution" accent="slate">
            <div className="h-[200px]">
              <SafeResponsiveContainer>
                <BarChart data={ratingBreakdown} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="star" width={28} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [`${v} reviews`, 'Count']} />
                  <Bar isAnimationActive={CHART_ANIMATION} dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {ratingBreakdown.map((_, i) => (
                      <Cell key={i} fill={RATING_COLORS[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </SafeResponsiveContainer>
            </div>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

export default memo(StoreDashboardChartPanels);
