import React, { useMemo } from "react";
import { Circle, Group, Layer, Line } from "react-konva";
import { useRealtimeStore } from "@/store/useRealtimeStore";
import { TAG_HEIGHT } from "@/realtime/presenceText";
import type { Presence } from "@/realtime/types";
import type { Measurement, Point, TakeoffItem } from "@/types/takeoff";
import { measurementBelongsToPlan } from "@/utils/planDocument";
import { getMeasurementType } from "@/utils/takeoffMeasurement";
import NameTag from "@/components/takeoff/PresenceNameTag";

/**
 * Collaborators on the CURRENT page, drawn above the plan and measurements in
 * the same plan-pixel space: their cursor + name tag, the run they are
 * mid-drawing (dashed, 60%), and an outline on every measurement someone
 * else holds an edit lock on. Never listens — nothing here is clickable.
 *
 * Sizes are compensated with `labelScale` (1 / (stageScale × imageScale))
 * exactly like the measurement labels, so tags and strokes stay a constant
 * screen size while zooming.
 */

interface PresenceLayerProps {
  currentPage: number;
  activePlanId: string | null;
  imageScale: number;
  stageScale: number;
  takeoffItems: TakeoffItem[];
}

// Classic pointer arrow, tip at (0,0), in screen px.
const ARROW = [0, 0, 0, 17, 4.5, 13, 8, 20, 11, 18.5, 7.5, 12, 13, 12];

const flatten = (points: Point[]): number[] => {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
};

const PresenceLayer: React.FC<PresenceLayerProps> = ({
  currentPage,
  activePlanId,
  imageScale,
  stageScale,
  takeoffItems,
}) => {
  const members = useRealtimeStore((s) => s.members);
  const self = useRealtimeStore((s) => s.self);
  const cursors = useRealtimeStore((s) => s.cursors);
  const drafts = useRealtimeStore((s) => s.drafts);
  const locks = useRealtimeStore((s) => s.locks);

  const safeImageScale = imageScale > 0 ? imageScale : 1;
  const labelScale = 1 / (stageScale * safeImageScale);

  const others = useMemo(
    () => members.filter((m) => m.userId !== self?.userId),
    [members, self?.userId]
  );
  const byId = useMemo(() => new Map(others.map((m) => [m.userId, m])), [others]);

  // Measurements on this page locked by somebody else.
  const lockedShapes = useMemo(() => {
    const out: { measurement: Measurement; item: TakeoffItem; holder: Presence }[] = [];
    const held = new Map<string, Presence>();
    for (const [key, holder] of Object.entries(locks)) {
      if (!holder || holder.userId === self?.userId) continue;
      if (!key.startsWith("measurement:")) continue;
      held.set(key.slice("measurement:".length), holder);
    }
    if (held.size === 0) return out;
    for (const item of takeoffItems) {
      for (const m of item.measurements) {
        const holder = held.get(m.id);
        if (!holder) continue;
        if (m.page !== currentPage || !measurementBelongsToPlan(m, activePlanId) || m.hidden) continue;
        out.push({ measurement: m, item, holder });
      }
    }
    return out;
  }, [locks, self?.userId, takeoffItems, currentPage, activePlanId]);

  const hasAnything =
    others.length > 0 && (Object.keys(cursors).length > 0 || Object.keys(drafts).length > 0 || lockedShapes.length > 0);
  if (!hasAnything) return <Layer listening={false} />;

  return (
    <Layer listening={false}>
      <Group scaleX={safeImageScale} scaleY={safeImageScale}>
        {/* Lock outlines go under cursors so a tag never hides a pointer. */}
        {lockedShapes.map(({ measurement, item, holder }) => {
          const type = getMeasurementType(measurement, item);
          const first = measurement.points[0];
          if (!first) return null;
          return (
            <Group key={`lock-${measurement.id}`}>
              {type === "count" || measurement.points.length === 1 ? (
                measurement.points.map((p, i) => (
                  <Circle
                    key={i}
                    x={p.x}
                    y={p.y}
                    radius={9 * labelScale}
                    stroke={holder.color}
                    strokeWidth={2 * labelScale}
                  />
                ))
              ) : (
                <Line
                  points={flatten(measurement.points)}
                  closed={type === "area"}
                  stroke={holder.color}
                  strokeWidth={2 * labelScale}
                  lineJoin="round"
                  lineCap="round"
                />
              )}
              <Group x={first.x} y={first.y} scaleX={labelScale} scaleY={labelScale}>
                <NameTag name={holder.name} color={holder.color} x={8} y={-TAG_HEIGHT - 6} />
              </Group>
            </Group>
          );
        })}

        {Object.entries(drafts).map(([id, draft]) => {
          const member = byId.get(Number(id));
          if (!member || draft.page !== currentPage || draft.points.length === 0) return null;
          if (draft.tool === "count") {
            return (
              <Group key={`draft-${id}`} opacity={0.6}>
                {draft.points.map((p, i) => (
                  <Circle key={i} x={p.x} y={p.y} radius={5 * labelScale} fill={member.color} />
                ))}
              </Group>
            );
          }
          const closed = draft.tool === "area" && draft.points.length >= 3;
          return (
            <Group key={`draft-${id}`} opacity={0.6}>
              <Line
                points={flatten(draft.points)}
                closed={closed}
                stroke={member.color}
                fill={closed ? member.color : undefined}
                fillEnabled={closed}
                opacity={closed ? 0.9 : 1}
                strokeWidth={2 * labelScale}
                dash={[6 * labelScale, 4 * labelScale]}
                lineJoin="round"
                lineCap="round"
              />
              {closed && (
                <Line
                  points={flatten(draft.points)}
                  closed
                  fill={member.color}
                  opacity={0.15}
                  strokeEnabled={false}
                />
              )}
              {draft.points.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={3 * labelScale} fill={member.color} />
              ))}
            </Group>
          );
        })}

        {Object.entries(cursors).map(([id, cursor]) => {
          const member = byId.get(Number(id));
          if (!member || cursor.page !== currentPage) return null;
          return (
            <Group key={`cursor-${id}`} x={cursor.x} y={cursor.y} scaleX={labelScale} scaleY={labelScale}>
              <Line
                points={ARROW}
                closed
                fill={member.color}
                stroke="#ffffff"
                strokeWidth={1.5}
                lineJoin="round"
                shadowColor="rgba(0,0,0,0.35)"
                shadowBlur={3}
                shadowOffsetY={1}
              />
              <NameTag name={member.name} color={member.color} x={14} y={18} />
            </Group>
          );
        })}
      </Group>
    </Layer>
  );
};

export default PresenceLayer;
