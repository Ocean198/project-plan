"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { VelocityEntry } from "@/app/api/dashboard/route";

interface VelocityChartProps {
  data: VelocityEntry[];
  locationColors: Record<string, string>;
}

export function VelocityChart({ data, locationColors }: VelocityChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">Noch keine abgeschlossenen Aufgaben.</p>;
  }

  const locations = Object.keys(locationColors);

  // Durchschnitt pro Standort (letzte 6 Monate)
  const last6 = data.slice(-6);
  const averages: Record<string, number> = {};
  locations.forEach((loc) => {
    const sum = last6.reduce((acc, d) => acc + ((d[loc] as number) ?? 0), 0);
    averages[loc] = last6.length > 0 ? Math.round(sum / last6.length) : 0;
  });

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="sprint_label"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "SP", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#9ca3af" } }}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #f0f0f0", fontSize: 12 }}
            formatter={(val, name) => [
              `${val} SP (Ø ${averages[String(name)] ?? 0} SP)`,
              name,
            ]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
          {locations.map((loc) => (
            <Line
              key={loc}
              type="monotone"
              dataKey={loc}
              stroke={locationColors[loc]}
              strokeWidth={2}
              dot={{ r: 3, fill: locationColors[loc] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Durchschnittswerte */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {locations.map((loc) => (
          <div key={loc} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: locationColors[loc] }} />
            <div className="min-w-0">
              <p className="text-xs text-gray-500 truncate">{loc}</p>
              <p className="text-sm font-semibold text-gray-800">Ø {averages[loc]} SP</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
