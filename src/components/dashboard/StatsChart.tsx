import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export interface StatsPoint {
  day: string;
  calls: number;
}

const defaultData: StatsPoint[] = [
  { day: "Mon", calls: 37 },
  { day: "Tue", calls: 38 },
  { day: "Wed", calls: 43 },
  { day: "Thu", calls: 43 },
  { day: "Fri", calls: 46 },
  { day: "Sat", calls: 11 },
  { day: "Sun", calls: 18 },
];

const StatsChart = ({ data = defaultData }: { data?: StatsPoint[] }) => {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="callsGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--primary-variant))" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.2)" />
          <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
          <YAxis stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
          <Line type="monotone" dataKey="calls" stroke="url(#callsGradient)" strokeWidth={3} dot={{ r: 3, stroke: "hsl(var(--card))", strokeWidth: 1 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StatsChart;
