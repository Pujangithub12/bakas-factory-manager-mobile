import React, { useState } from "react";
import { View } from "react-native";
import Svg, { Line, Polyline, Rect, Circle, Text as SvgText } from "react-native-svg";
import { C } from "./ui";

export type Series = { name: string; color: string; values: number[] };

const nice = (max: number) => {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1));

/** One line per series over the same labels (the raw material collection chart). */
export function LineChart({ labels, series, height = 200 }: { labels: string[]; series: Series[]; height?: number }) {
  const [w, setW] = useState(0);
  const top = nice(Math.max(0, ...series.flatMap((s) => s.values)));
  const L = 34, B = 22, T = 8, R = 6;
  const x = (i: number) => L + (labels.length <= 1 ? (w - L - R) / 2 : (i * (w - L - R)) / (labels.length - 1));
  const y = (v: number) => T + (1 - v / top) * (height - T - B);
  const every = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <React.Fragment key={g}>
              <Line x1={L} x2={w - R} y1={y(top * g)} y2={y(top * g)} stroke={g === 0 ? C.line : "#e6e8e2"} strokeWidth={1} />
              <SvgText x={L - 4} y={y(top * g) + 4} fontSize={10} fill={C.sub} textAnchor="end">{fmt(top * g)}</SvgText>
            </React.Fragment>
          ))}
          {labels.map((l, i) => (i % every === 0 ? <SvgText key={i} x={x(i)} y={height - 6} fontSize={10} fill={C.sub} textAnchor="middle">{l}</SvgText> : null))}
          {series.map((s) => (
            <React.Fragment key={s.name}>
              <Polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} />
              {labels.length <= 14 ? s.values.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />) : null}
            </React.Fragment>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** Side-by-side columns per label (the production chart). */
export function ColumnChart({ labels, series, height = 200 }: { labels: string[]; series: Series[]; height?: number }) {
  const [w, setW] = useState(0);
  const top = nice(Math.max(0, ...series.flatMap((s) => s.values)));
  const L = 34, B = 22, T = 8, R = 6;
  const slot = labels.length ? (w - L - R) / labels.length : 0;
  const bar = Math.max(2, (slot * 0.8) / Math.max(1, series.length));
  const y = (v: number) => T + (1 - v / top) * (height - T - B);
  const every = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <React.Fragment key={g}>
              <Line x1={L} x2={w - R} y1={y(top * g)} y2={y(top * g)} stroke={g === 0 ? C.line : "#e6e8e2"} strokeWidth={1} />
              <SvgText x={L - 4} y={y(top * g) + 4} fontSize={10} fill={C.sub} textAnchor="end">{fmt(top * g)}</SvgText>
            </React.Fragment>
          ))}
          {labels.map((l, i) => (i % every === 0 ? <SvgText key={i} x={L + slot * i + slot / 2} y={height - 6} fontSize={10} fill={C.sub} textAnchor="middle">{l}</SvgText> : null))}
          {series.map((s, k) => s.values.map((v, i) => (
            <Rect key={`${k}-${i}`} x={L + slot * i + slot * 0.1 + bar * k} y={y(v)} width={bar - 1} height={Math.max(0, y(0) - y(v))} fill={s.color} />
          )))}
        </Svg>
      ) : null}
    </View>
  );
}

export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#a3a69f"];
