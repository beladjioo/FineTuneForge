"use client";

import { type PointerEvent, useMemo, useRef, useState } from "react";
import { useElementWidth } from "@/hooks/use-element-width";
import { nearestIndex, niceTicks } from "../lib/chart";
import type { MetricPoint } from "../live";

/**
 * Training / validation loss over steps. Hand-rolled SVG: two series, recessive
 * grid, direct end labels, crosshair tooltip (pointer + arrow keys) and a table view.
 */

const HEIGHT = 240;
const MARGIN = { top: 12, right: 52, bottom: 28, left: 44 };

const formatLoss = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
const formatTick = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const SERIES = {
  train: { label: "Entraînement", color: "var(--series-1)" },
  eval: { label: "Validation", color: "var(--series-2)" },
} as const;

function pointLabel(point: MetricPoint | undefined): string {
  if (!point) return "";
  const parts = [`Step ${point.step}`];
  if (point.trainLoss !== undefined)
    parts.push(`loss d'entraînement ${formatLoss(point.trainLoss)}`);
  if (point.evalLoss !== undefined) parts.push(`loss de validation ${formatLoss(point.evalLoss)}`);
  return parts.join(", ");
}

function linePath(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
}

export function LossChart({ points, totalSteps }: { points: MetricPoint[]; totalSteps?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [hover, setHover] = useState<number | null>(null);

  const train = points.filter((point) => point.trainLoss !== undefined);
  const evals = points.filter((point) => point.evalLoss !== undefined);
  const hasEval = evals.length > 0;

  const geometry = useMemo(() => {
    const values = [
      ...train.map((point) => point.trainLoss as number),
      ...evals.map((point) => point.evalLoss as number),
    ];
    const yTicks = niceTicks(Math.min(...values), Math.max(...values));
    const y0 = yTicks[0] ?? 0;
    const y1 = yTicks[yTicks.length - 1] ?? 1;
    const lastStep = points[points.length - 1]?.step ?? 1;
    const xMax = Math.max(totalSteps ?? 0, lastStep, 1);
    const xTicks = niceTicks(0, xMax, 5).filter((tick) => tick <= xMax);
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = (step: number) => MARGIN.left + (step / xMax) * plotWidth;
    const y = (value: number) => MARGIN.top + (1 - (value - y0) / (y1 - y0 || 1)) * plotHeight;
    return { yTicks, xTicks, xMax, plotWidth, plotHeight, x, y };
  }, [train, evals, points, totalSteps, width]);

  if (train.length === 0 && !hasEval) return null;
  const { x, y, yTicks, xTicks, plotWidth, plotHeight, xMax } = geometry;

  const trainXY = train.map((point) => ({ x: x(point.step), y: y(point.trainLoss as number) }));
  const evalXY = evals.map((point) => ({ x: x(point.step), y: y(point.evalLoss as number) }));
  const lastTrain = train[train.length - 1];
  const lastEval = evals[evals.length - 1];
  const trainEnd = trainXY[trainXY.length - 1];
  const evalEnd = evalXY[evalXY.length - 1];
  // End labels only when they don't collide; otherwise legend + tooltip carry the values.
  const labelsCollide = trainEnd && evalEnd && Math.abs(trainEnd.y - evalEnd.y) < 14;

  const steps = points.map((point) => point.step);
  const hovered = hover === null ? null : points[hover];

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const step = ((event.clientX - box.left) / box.width) * xMax;
    setHover(nearestIndex(steps, step));
  };

  const summary = lastTrain
    ? `Loss d'entraînement : ${formatLoss(train[0]?.trainLoss as number)} au départ, ${formatLoss(lastTrain.trainLoss as number)} au step ${lastTrain.step}.`
    : "";
  const tooltipLeft = hovered ? x(hovered.step) : 0;
  const flip = tooltipLeft > width - 180;

  return (
    <div className="space-y-3">
      {hasEval ? (
        <ul className="flex flex-wrap gap-4 text-muted-foreground text-xs" aria-label="Légende">
          {Object.values(SERIES).map((series) => (
            <li key={series.label} className="flex items-center gap-2">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ background: series.color }}
                aria-hidden
              />
              {series.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        ref={containerRef}
        className="relative rounded-md has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50"
      >
        {/* Keyboard access: arrow keys step through the points (announced via aria-valuetext). */}
        <input
          type="range"
          className="sr-only"
          min={0}
          max={Math.max(0, points.length - 1)}
          value={hover ?? points.length - 1}
          onChange={(event) => setHover(Number(event.target.value))}
          onBlur={() => setHover(null)}
          aria-label="Parcourir les points de la courbe de loss"
          aria-valuetext={pointLabel(points[hover ?? points.length - 1])}
        />
        <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block">
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + plotWidth}
            y1={MARGIN.top + plotHeight}
            y2={MARGIN.top + plotHeight}
            stroke="var(--chart-axis)"
            strokeWidth={1}
          />
          {xTicks.map((tick) => (
            <text
              key={`x-${tick}`}
              x={x(tick)}
              y={MARGIN.top + plotHeight + 18}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {formatTick(tick)}
            </text>
          ))}

          {trainXY.length > 1 ? (
            <path
              d={linePath(trainXY)}
              fill="none"
              stroke={SERIES.train.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {evalXY.length > 1 ? (
            <path
              d={linePath(evalXY)}
              fill="none"
              stroke={SERIES.eval.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {evalXY.map((point) => (
            <circle
              key={`eval-${point.x}`}
              cx={point.x}
              cy={point.y}
              r={4}
              fill={SERIES.eval.color}
              stroke="var(--card)"
              strokeWidth={2}
            />
          ))}
          {trainEnd ? (
            <circle
              cx={trainEnd.x}
              cy={trainEnd.y}
              r={4}
              fill={SERIES.train.color}
              stroke="var(--card)"
              strokeWidth={2}
            />
          ) : null}

          {!labelsCollide && trainEnd && lastTrain ? (
            <text
              x={trainEnd.x + 8}
              y={trainEnd.y}
              dy="0.32em"
              className="fill-foreground font-medium text-[11px] tabular-nums"
            >
              {formatLoss(lastTrain.trainLoss as number)}
            </text>
          ) : null}
          {!labelsCollide && evalEnd && lastEval ? (
            <text
              x={evalEnd.x + 8}
              y={evalEnd.y}
              dy="0.32em"
              className="fill-foreground font-medium text-[11px] tabular-nums"
            >
              {formatLoss(lastEval.evalLoss as number)}
            </text>
          ) : null}

          {hovered ? (
            <line
              x1={x(hovered.step)}
              x2={x(hovered.step)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              stroke="var(--chart-muted)"
              strokeWidth={1}
            />
          ) : null}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute top-2 min-w-36 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
            style={flip ? { right: width - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}
          >
            <p className="mb-1 text-muted-foreground">
              Step {hovered.step}
              {hovered.epoch !== undefined ? ` · epoch ${formatTick(hovered.epoch)}` : ""}
            </p>
            {hovered.trainLoss !== undefined ? (
              <p className="flex items-center gap-2">
                <span
                  className="h-0.5 w-3 rounded-full"
                  style={{ background: SERIES.train.color }}
                />
                <span className="font-semibold tabular-nums">{formatLoss(hovered.trainLoss)}</span>
                <span className="text-muted-foreground">{SERIES.train.label}</span>
              </p>
            ) : null}
            {hovered.evalLoss !== undefined ? (
              <p className="flex items-center gap-2">
                <span
                  className="h-0.5 w-3 rounded-full"
                  style={{ background: SERIES.eval.color }}
                />
                <span className="font-semibold tabular-nums">{formatLoss(hovered.evalLoss)}</span>
                <span className="text-muted-foreground">{SERIES.eval.label}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer select-none text-muted-foreground text-xs">
          Voir les données ({points.length} points)
        </summary>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr className="text-left">
                <th className="px-3 py-1.5 font-medium">Step</th>
                <th className="px-3 py-1.5 font-medium">Epoch</th>
                <th className="px-3 py-1.5 text-right font-medium">Loss entraînement</th>
                <th className="px-3 py-1.5 text-right font-medium">Loss validation</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {points.map((point) => (
                <tr key={point.step} className="border-t">
                  <td className="px-3 py-1">{point.step}</td>
                  <td className="px-3 py-1">
                    {point.epoch !== undefined ? formatTick(point.epoch) : "—"}
                  </td>
                  <td className="px-3 py-1 text-right">
                    {point.trainLoss !== undefined ? formatLoss(point.trainLoss) : "—"}
                  </td>
                  <td className="px-3 py-1 text-right">
                    {point.evalLoss !== undefined ? formatLoss(point.evalLoss) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
