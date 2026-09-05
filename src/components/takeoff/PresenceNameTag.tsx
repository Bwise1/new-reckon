import React from "react";
import { Group, Rect, Text } from "react-konva";
import {
  measureTagText,
  PRESENCE_FONT,
  TAG_FONT_SIZE,
  TAG_HEIGHT,
  TAG_PAD_X,
} from "@/realtime/presenceText";

/** Pill with a member's name, drawn in screen px (wrap in a scaled Group). */
const PresenceNameTag: React.FC<{ name: string; color: string; x?: number; y?: number }> = ({
  name,
  color,
  x = 0,
  y = 0,
}) => {
  const width = measureTagText(name) + TAG_PAD_X * 2;
  return (
    <Group x={x} y={y} listening={false}>
      <Rect width={width} height={TAG_HEIGHT} cornerRadius={10} fill={color} />
      <Text
        x={TAG_PAD_X}
        y={(TAG_HEIGHT - TAG_FONT_SIZE) / 2}
        text={name}
        fontSize={TAG_FONT_SIZE}
        fontFamily={PRESENCE_FONT}
        fill="#ffffff"
      />
    </Group>
  );
};

export default PresenceNameTag;
