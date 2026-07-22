import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useCustomers, type Customer } from "@/context/CustomersContext";
import { formatGBP } from "@/lib/currency";
import {
  Target, Users, TrendingUp, TrendingDown, PoundSterling,
  RefreshCw, BarChart3, PieChart, CalendarClock, ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";

type LeadMeta = NonNullable<Customer['leadMetadata']>;

const SOURCE_LABELS: Record<string, string> = {
  website: '🌐 Website',
  referral: '👥 Referral',
  social_media: '📱 Social Media',
  email_campaign: '📧 Email Campaign',
  cold_call: '📞 Cold Call',
  event: '🎪 Event',
  networking_bni: '🤝 BNI',
  networking_fsb: '🤝 FSB',
  networking_other: '🤝 Networking',
};

function getMeta(lead: Customer): LeadMeta {
  return (lead.leadMetadata as LeadMeta) || {};
}

function getCustomerMRR(c: Customer): number {
  let rev = 0;
  if (c.vrPrice) rev += Number(c.vrPrice);
  if (c.aiMonthlyFee) rev += Number(c.aiMonthlyFee);
  if (c.vaPackagedHours && c.vaHourlyOverageRate)
    rev += Number(c.vaPackagedHours) * Number(c.vaHourlyOverageRate);
  return rev;
}

function MetricCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string; value: string; subtitle?: string;
  icon: React.ElementType; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {trend === 'up' && <ArrowUpRight className="h-4 w-4 text-green-600" />}
          {trend === 'down' && <ArrowDownRight className="h-4 w-4 text-red-500" />}
          {trend === 'neutral' && <Minus className="h-4 w-4 text-muted-foreground" />}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export function CRMDashboard() {
  const { leads, activeCustomers, customers, refreshCustomers } = useCustomers();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await refreshCustomers(); } finally { setIsRefreshing(false); }
  };

  // ── Derived data ──
  const statusStats = useMemo(() => leads.reduce((acc, lead) => {
    const s = getMeta(lead).pipelineStatus || 'new';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [leads]);

  const lostLeads = useMemo(() => customers.filter(c => c.status === 'Lost'), [customers]);
  const wonLeads = useMemo(() => leads.filter(l => getMeta(l).pipelineStatus === 'won'), [leads]);
  const qualifiedLeads = useMemo(() => leads.filter(l => {
    const s = getMeta(l).pipelineStatus;
    return s === 'qualified' || s === 'proposal' || s === 'negotiation';
  }), [leads]);

  const totalLeadValue = useMemo(() =>
    leads.reduce((sum, l) => sum + (getMeta(l).value || 0), 0), [leads]);

  const conversionRate = leads.length > 0
    ? Math.round(((statusStats.won || 0) / leads.length) * 100) : 0;

  // ── MRR ──
  const mrr = useMemo(() => activeCustomers.reduce((s, c) => s + getCustomerMRR(c), 0), [activeCustomers]);

  const newRevenueThisMonth = useMemo(() =>
    wonLeads.reduce((s, l) => s + (getMeta(l).value || 0), 0), [wonLeads]);

  const lostRevenue = useMemo(() =>
    lostLeads.reduce((s, l) => s + (getMeta(l).value || 0), 0), [lostLeads]);

  const netGrowth = newRevenueThisMonth - lostRevenue;

  // ── Source performance ──
  const sourcePerformance = useMemo(() => {
    const map: Record<string, { total: number; won: number; revenue: number }> = {};
    leads.forEach(l => {
      const m = getMeta(l);
      const src = m.heardAboutUs || m.source || 'unknown';
      if (!map[src]) map[src] = { total: 0, won: 0, revenue: 0 };
      map[src].total += 1;
      if (m.pipelineStatus === 'won') {
        map[src].won += 1;
        map[src].revenue += m.value || 0;
      }
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total);
  }, [leads]);

  // ── Forecast ──
  const pipelineLeads = useMemo(() =>
    leads.filter(l => {
      const s = getMeta(l).pipelineStatus;
      return s && !['won', 'lost'].includes(s);
    }), [leads]);

  const totalPipelineValue = useMemo(() =>
    pipelineLeads.reduce((s, l) => s + (getMeta(l).value || 0), 0), [pipelineLeads]);

  const weightedPipeline = useMemo(() => {
    const weights: Record<string, number> = {
      new: 0.1, contacted: 0.2, qualified: 0.4, proposal: 0.6, negotiation: 0.8,
    };
    return pipelineLeads.reduce((s, l) => {
      const m = getMeta(l);
      const w = weights[m.pipelineStatus || 'new'] || 0.1;
      return s + (m.value || 0) * w;
    }, 0);
  }, [pipelineLeads]);

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      {/* ═══ A. SALES PERFORMANCE ═══ */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Sales Performance
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard title="Total Leads" value={String(leads.length)}
            subtitle={`Pipeline: ${formatGBP(totalLeadValue)}`} icon={Target} />
          <MetricCard title="Qualified" value={String(qualifiedLeads.length)}
            subtitle={`${leads.length > 0 ? Math.round((qualifiedLeads.length / leads.length) * 100) : 0}% of total`}
            icon={Users} />
          <MetricCard title="Conversion Rate" value={`${conversionRate}%`}
            subtitle={`${statusStats.won || 0} won of ${leads.length}`}
            icon={TrendingUp} trend={conversionRate > 20 ? 'up' : conversionRate > 0 ? 'neutral' : 'down'} />
          <MetricCard title="Deals Won" value={String(statusStats.won || 0)}
            subtitle={`${formatGBP(wonLeads.reduce((s, l) => s + (getMeta(l).value || 0), 0))} value`}
            icon={TrendingUp} trend="up" />
          <MetricCard title="Deals Lost" value={String((statusStats.lost || 0) + lostLeads.length)}
            subtitle={`${formatGBP(lostRevenue)} lost`}
            icon={TrendingDown} trend={lostLeads.length > 0 ? 'down' : 'neutral'} />
        </div>
      </div>

      {/* ═══ B. LEAD SOURCE PERFORMANCE ═══ */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary" /> Lead Source Performance
        </h2>
        <Card>
          <CardContent className="pt-6">
            {sourcePerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No lead source data available</p>
            ) : (
              <div className="space-y-4">
                {/* Header */}
                <div className="hidden sm:grid grid-cols-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-2 border-b">
                  <span>Source</span>
                  <span className="text-center">Leads</span>
                  <span className="text-center">Conversion</span>
                  <span className="text-right">Revenue</span>
                </div>
                {sourcePerformance.map(([source, data]) => {
                  const cvr = data.total > 0 ? Math.round((data.won / data.total) * 100) : 0;
                  return (
                    <div key={source} className="grid grid-cols-4 items-center py-2 hover:bg-muted/30 rounded-md px-1 transition-colors text-xs sm:text-sm">
                      <span className="text-sm font-medium">
                        {SOURCE_LABELS[source] || source}
                      </span>
                      <span className="text-center">
                        <Badge variant="secondary" className="text-xs">{data.total}</Badge>
                      </span>
                      <div className="flex items-center justify-center gap-2">
                        <Progress value={cvr} className="w-16 h-2" />
                        <span className="text-xs font-medium w-8">{cvr}%</span>
                      </div>
                      <span className="text-right text-sm font-semibold">
                        {formatGBP(data.revenue)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══ C. REVENUE DASHBOARD ═══ */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <PoundSterling className="h-5 w-5 text-primary" /> Revenue
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard title="Monthly Recurring" value={`${formatGBP(mrr)}`}
              subtitle={`From ${activeCustomers.length} active customers`} icon={PoundSterling} />
            <MetricCard title="New Revenue" value={`${formatGBP(newRevenueThisMonth)}`}
              subtitle="From won deals" icon={TrendingUp} trend="up" />
            <MetricCard title="Lost Revenue" value={`${formatGBP(lostRevenue)}`}
              subtitle={`${lostLeads.length} lost leads`} icon={TrendingDown}
              trend={lostRevenue > 0 ? 'down' : 'neutral'} />
            <MetricCard title="Net Growth" value={`${netGrowth >= 0 ? '+' : ''}${formatGBP(Math.abs(netGrowth))}`}
              subtitle={netGrowth >= 0 ? 'Positive growth' : 'Revenue decline'}
              icon={TrendingUp} trend={netGrowth > 0 ? 'up' : netGrowth < 0 ? 'down' : 'neutral'} />
          </div>
        </div>

        {/* ═══ D. FORECAST DASHBOARD ═══ */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" /> Pipeline Forecast
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Open pipeline value</span>
                <span className="text-xl font-bold">{formatGBP(totalPipelineValue)}</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Next 30 days', factor: 0.6 },
                  { label: 'Next 60 days', factor: 0.8 },
                  { label: 'Next 90 days', factor: 1.0 },
                ].map(({ label, factor }) => {
                  const expected = Math.round(weightedPipeline * factor);
                  const pct = totalPipelineValue > 0 ? Math.round((expected / totalPipelineValue) * 100) : 0;
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold">{formatGBP(expected)}</span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-2" />
                    </div>
                  );
                })}
              </div>
              <div className="pt-3 border-t text-xs text-muted-foreground">
                Weighted by pipeline stage probability (New 10% → Negotiation 80%)
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lead Pipeline Breakdown */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" /> Lead Pipeline
        </h2>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map(status => {
                const count = statusStats[status] || 0;
                const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                const colors: Record<string, string> = {
                  new: 'bg-blue-500', contacted: 'bg-yellow-500', qualified: 'bg-purple-500',
                  proposal: 'bg-orange-500', negotiation: 'bg-cyan-500', won: 'bg-green-500', lost: 'bg-red-500'
                };
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="text-sm capitalize w-24">{status}</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className={`h-2 rounded-full ${colors[status]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
