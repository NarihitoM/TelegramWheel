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
const NAME_HEIGHT = 34;
const CARD_PADDING = 40;
const MAX_HEIGHT = 8000;

const NAME_STYLE: Style = {
  display: "block",
  fontSize: 22,
  lineHeight: `${NAME_HEIGHT}px`,
  height: NAME_HEIGHT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function h(type: string, style: Style, children?: string | OgNode | OgNode[]): OgNode {
  return { type, props: { style, children } };
}

function cardHeight(size: number): number {
  const lines = Math.min(size, MAX_NAMES_PER_CARD) + (size > MAX_NAMES_PER_CARD ? 1 : 0);
  return CARD_TITLE_HEIGHT + lines * NAME_HEIGHT + CARD_PADDING;
}

function card(title: string, members: Member[], color: string, width: number, height: number): OgNode {
  const names = members.slice(0, MAX_NAMES_PER_CARD).map((member, index) =>
    h("div", { ...NAME_STYLE, color: "#e5e7eb" }, `${index + 1}. ${toVisualOrder(member.name)}`),
  );
  if (members.length > MAX_NAMES_PER_CARD) {
    names.push(
      h("div", { ...NAME_STYLE, color: "#9ca3af" }, `+${members.length - MAX_NAMES_PER_CARD} more`),
    );
  }

  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width,
      height,
      padding: 20,
      borderRadius: 20,
      backgroundColor: "#1f2937",
      borderTop: `8px solid ${color}`,
      overflow: "hidden",
    },
    [h("div", { display: "flex", fontSize: 30, fontWeight: 700, color, height: CARD_TITLE_HEIGHT - 20 }, title), ...names],
  );
}

export async function renderResultImage(result: SpinResult, chatTitle: string): Promise<Buffer> {
  const columns = Math.min(result.teams.length, MAX_COLUMNS);
  const cardWidth = Math.floor((WIDTH - PADDING * 2 - GAP * (columns - 1)) / columns);
  const rowHeight = cardHeight(Math.max(...result.teams.map((team) => team.length))) + GAP;

  const maxRows = Math.max(1, Math.floor((MAX_HEIGHT - HEADER_HEIGHT - PADDING * 2) / rowHeight));
  const shownTeams = result.teams.slice(0, maxRows * columns);
  const hiddenTeams = result.teams.length - shownTeams.length;
  const rows = Math.ceil(shownTeams.length / columns);
  const height = HEADER_HEIGHT + PADDING * 2 + rows * rowHeight;

  const cards = shownTeams.map((team, index) =>
    card(`Group ${index + 1}`, team, COLORS[index % COLORS.length] ?? "#3b82f6", cardWidth, rowHeight - GAP),
  );

  const subtitle = [
    `${result.teams.length} groups x ${result.teams[0]?.length ?? 0} members`,
    result.leftovers.length > 0 ? `${result.leftovers.length} not picked` : "",
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
    "Spin Wheel Result Group 0123456789 x | + more members not picked groups in text",
    chatTitle,
    ...shownTeams.flat().map((member) => member.name),
  ]);
  const response = new ImageResponse(root, { width: WIDTH, height, fonts });
  return Buffer.from(await response.arrayBuffer());
}
