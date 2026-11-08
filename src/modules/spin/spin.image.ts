import { ImageResponse } from "@vercel/og";
import { IMAGE_FONT_FAMILY, loadImageFonts, toVisualOrder } from "./spin.fonts.js";
import type { Member, SpinResult } from "./spin.types.js";

type Style = Record<string, string | number>;

interface OgNode {
  type: string;
  props: {
    style?: Style;
    children?: string | OgNode | OgNode[];
  };
}

const WIDTH = 1200;
const PADDING = 48;
const GAP = 24;
const MAX_COLUMNS = 4;
const MAX_NAMES_PER_CARD = 15;
const HEADER_HEIGHT = 180;
const CARD_TITLE_HEIGHT = 64;
const CARD_PADDING = 40;
const CARD_INNER_PADDING = 20;
const NAME_FONT_SIZE = 22;
const NAME_HEIGHT = 34;
const MAX_NAME_LINES = 3;
const MAX_HEIGHT = 8000;

const NAME_STYLE: Style = {
  display: "block",
  fontSize: NAME_FONT_SIZE,
  lineHeight: `${NAME_HEIGHT}px`,
  wordBreak: "break-word",
  overflow: "hidden",
};

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function h(type: string, style: Style, children?: string | OgNode | OgNode[]): OgNode {
  return { type, props: { style, children } };
}

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x2e80 ? 1.05 : 0.62;
}

export function estimateLines(text: string, width: number, fontSize = NAME_FONT_SIZE): number {
  const textWidth = [...text].reduce((total, char) => total + charWidth(char) * fontSize, 0);
  return Math.min(MAX_NAME_LINES, Math.max(1, Math.ceil(textWidth / width)));
}

function nameLines(members: Member[], width: number): number[] {
  const lines = members
    .slice(0, MAX_NAMES_PER_CARD)
    .map((member, index) => estimateLines(`${index + 1}. ${member.name}`, width));
  return members.length > MAX_NAMES_PER_CARD ? [...lines, 1] : lines;
}

function cardHeight(members: Member[], width: number): number {
  const lines = nameLines(members, width).reduce((total, count) => total + count, 0);
  return CARD_TITLE_HEIGHT + lines * NAME_HEIGHT + CARD_PADDING;
}

function card(title: string, members: Member[], color: string, width: number, height: number): OgNode {
  const lines = nameLines(members, width - CARD_INNER_PADDING * 2);
  const names = members.slice(0, MAX_NAMES_PER_CARD).map((member, index) =>
    h(
      "div",
      { ...NAME_STYLE, maxHeight: (lines[index] ?? 1) * NAME_HEIGHT, color: "#e5e7eb" },
      `${index + 1}. ${toVisualOrder(member.name)}`,
    ),
  );
  if (members.length > MAX_NAMES_PER_CARD) {
    names.push(
      h("div", { ...NAME_STYLE, maxHeight: NAME_HEIGHT, color: "#9ca3af" }, `+${members.length - MAX_NAMES_PER_CARD} more`),
    );
  }

  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width,
      height,
      padding: CARD_INNER_PADDING,
      borderRadius: 20,
      backgroundColor: "#1f2937",
      borderTop: `8px solid ${color}`,
      overflow: "hidden",
    },
    [h("div", { display: "flex", fontSize: 30, fontWeight: 700, color, height: CARD_TITLE_HEIGHT - 20 }, title), ...names],
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export async function renderResultImage(result: SpinResult, chatTitle: string): Promise<Buffer> {
  const columns = Math.min(result.teams.length, MAX_COLUMNS);
  const cardWidth = Math.floor((WIDTH - PADDING * 2 - GAP * (columns - 1)) / columns);
  const textWidth = cardWidth - CARD_INNER_PADDING * 2;

  const rows: { teams: Member[][]; height: number }[] = [];
  let used = HEADER_HEIGHT + PADDING * 2;
  for (const teams of chunk(result.teams, columns)) {
    const height = Math.max(...teams.map((team) => cardHeight(team, textWidth)));
    if (rows.length > 0 && used + height + GAP > MAX_HEIGHT) {
      break;
    }
    rows.push({ teams, height });
    used += height + GAP;
  }

  const shownTeams = rows.flatMap((row) => row.teams);
  const hiddenTeams = result.teams.length - shownTeams.length;
  const height = used;

  let groupNumber = 0;
  const cards = rows.flatMap((row) =>
    row.teams.map((team) => {
      const index = groupNumber++;
      return card(`Group ${index + 1}`, team, COLORS[index % COLORS.length] ?? "#3b82f6", cardWidth, row.height);
    }),
  );

  const totalMembers = result.teams.flat().length;
  const subtitle = [
    `Total groups: ${result.teams.length}`,
    `Total members: ${totalMembers}`,
    `Per group: ${result.teams[0]?.length ?? 0}`,
    hiddenTeams > 0 ? `+${hiddenTeams} groups in text` : "",
  ]
    .filter(Boolean)
    .join("  |  ");

  const root = h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height,
      padding: PADDING,
      backgroundColor: "#111827",
      color: "#ffffff",
      fontFamily: IMAGE_FONT_FAMILY,
    },
    [
      h("div", { display: "flex", flexDirection: "column", height: HEADER_HEIGHT }, [
        h("div", { display: "flex", fontSize: 52, fontWeight: 700 }, "Spin Wheel Result"),
        h("div", { display: "flex", fontSize: 26, color: "#9ca3af", marginTop: 8 }, toVisualOrder(chatTitle)),
        h("div", { display: "flex", fontSize: 24, color: "#6b7280", marginTop: 4 }, subtitle),
      ]),
      h("div", { display: "flex", flexWrap: "wrap", gap: GAP }, cards),
    ],
  );

  const fonts = await loadImageFonts([
    "Spin Wheel Result Group Total groups members Per 0123456789 : | + more in text",
    chatTitle,
    ...shownTeams.flat().map((member) => member.name),
  ]);
  const response = new ImageResponse(root, { width: WIDTH, height, fonts });
  return Buffer.from(await response.arrayBuffer());
}
