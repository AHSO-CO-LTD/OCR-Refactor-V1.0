"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const data = [
  { shift: "08:00", ok: 42, ng: 1 },
  { shift: "09:00", ok: 58, ng: 2 },
  { shift: "10:00", ok: 64, ng: 0 },
  { shift: "11:00", ok: 51, ng: 3 },
  { shift: "12:00", ok: 47, ng: 1 },
];

export function InspectionTrendChart() {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="shift" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="ok" name="OK" fill="#0891b2" radius={[2, 2, 0, 0]} />
          <Bar dataKey="ng" name="NG" fill="#dc2626" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

