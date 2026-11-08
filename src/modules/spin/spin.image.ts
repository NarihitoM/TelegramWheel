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
const MAX_NAMES_PER_CARD = 30;
const HEADER_HEIGHT = 180;
const CARD_TITLE_HEIGHT = 64;
const CARD_PADDING = 40;
const CARD_INNER_PADDING = 20;
const NAME_FONT_SIZE = 22;
const NAME_HEIGHT = 34;
const MAX_NAME_LINES = 3;
const MAX_PAGE_HEIGHT = 4000;
const MAX_NAME_LENGTH = 80;
const RENDER_BUDGET_MS = 30_000;
export const MAX_IMAGE_PAGES = 20;

const NAME_STYLE: Style = {
  display: "block",
  fontSize: NAME_FONT_SIZE,
  lineHeight: `${NAME_HEIGHT}px`,
  wordBreak: "break-word",
};

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

interface CardSegment {
  groupNumber: number;
  continued: boolean;
  color: string;
  members: Member[];
  firstNumber: number;
}

interface Row {
  segments: CardSegment[];
  height: number;
}

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

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function displayName(name: string): string {
  const chars = [...name];
  return chars.length > MAX_NAME_LENGTH ? `${chars.slice(0, MAX_NAME_LENGTH - 1).join("")}\u2026` : name;
}

function nameText(segment: CardSegment, index: number): string {
  return `${segment.firstNumber + index}. ${displayName(segment.members[index]?.name ?? "")}`;
}

function nameLines(segment: CardSegment, textWidth: number): number[] {
  return segment.members.map((_, index) => estimateLines(nameText(segment, index), textWidth));
}

function cardHeight(segment: CardSegment, textWidth: number): number {
  const lines = nameLines(segment, textWidth).reduce((total, count) => total + count, 0);
  return CARD_TITLE_HEIGHT + lines * NAME_HEIGHT + CARD_PADDING;
}

export function buildSegments(teams: Member[][]): CardSegment[] {
  return teams.flatMap((team, teamIndex) =>
    chunk(team, MAX_NAMES_PER_CARD).map((members, part) => ({
      groupNumber: teamIndex + 1,
      continued: part > 0,
      color: COLORS[teamIndex % COLORS.length] ?? "#3b82f6",
      members,
      firstNumber: part * MAX_NAMES_PER_CARD + 1,
    })),
  );
}

function layoutPages(segments: CardSegment[], columns: number, textWidth: number): Row[][] {
  const pages: Row[][] = [];
  let page: Row[] = [];
  let used = HEADER_HEIGHT + PADDING * 2;

  for (const rowSegments of chunk(segments, columns)) {
    const height = Math.max(...rowSegments.map((segment) => cardHeight(segment, textWidth)));
    if (page.length > 0 && used + height + GAP > MAX_PAGE_HEIGHT) {
      pages.push(page);
      page = [];
      used = HEADER_HEIGHT + PADDING * 2;
    }
    page.push({ segments: rowSegments, height });
    used += height + GAP;
  }
  if (page.length > 0) {
    pages.push(page);
  }
  return pages;
}

function card(segment: CardSegment, width: number, height: number): OgNode {
  const names = segment.members.map((member, index) =>
    h("div", { ...NAME_STYLE, color: "#e5e7eb" }, `${segment.firstNumber + index}. ${toVisualOrder(displayName(member.name))}`),
  );

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
      borderTop: `8px solid ${segment.color}`,
    },
    [
      h("div", { display: "flex", alignItems: "baseline", height: CARD_TITLE_HEIGHT - 20 }, [
        h("div", { display: "flex", fontSize: 30, fontWeight: 700, color: segment.color }, `Group ${segment.groupNumber}`),
        ...(segment.continued
          ? [h("div", { display: "flex", fontSize: 18, color: "#9ca3af", marginLeft: 10 }, "cont.")]
          : []),
      ]),
      ...names,
    ],
  );
}

export async function renderResultImages(result: SpinResult, chatTitle: string): Promise<Buffer[]> {
  const segments = buildSegments(result.teams);
  const columns = Math.min(segments.length, MAX_COLUMNS);
  const cardWidth = Math.floor((WIDTH - PADDING * 2 - GAP * (columns - 1)) / columns);
  const textWidth = cardWidth - CARD_INNER_PADDING * 2;
  const allPages = layoutPages(segments, columns, textWidth);
  const pages = allPages.slice(0, MAX_IMAGE_PAGES);
  const shown = pages.flatMap((page) => page.flatMap((row) => row.segments));

  const fonts = await loadImageFonts([
    "Spin Wheel Result Group Total groups members Per Page of cont. 0123456789 : | ( ) + more in text",
    chatTitle,
    ...shown.flatMap((segment) => segment.members.map((member) => member.name)),
  ]);

  const totalMembers = result.teams.flat().length;
  const hiddenPages = allPages.length - pages.length;

  const started = Date.now();
  const images: Buffer[] = [];
  for (const [pageIndex, page] of pages.entries()) {
    if (images.length > 0 && Date.now() - started > RENDER_BUDGET_MS) {
      break;
    }
    const height = HEADER_HEIGHT + PADDING * 2 + page.reduce((total, row) => total + row.height + GAP, 0);
    const subtitle = [
      `Total groups: ${result.teams.length}`,
      `Total members: ${totalMembers}`,
      `Per group: ${result.teams[0]?.length ?? 0}`,
      pages.length > 1 ? `Page ${pageIndex + 1} of ${pages.length}` : "",
      hiddenPages > 0 && pageIndex === pages.length - 1 ? "more in text" : "",
    ]
      .filter(Boolean)
      .join("  |  ");

    const cards = page.flatMap((row) => row.segments.map((segment) => card(segment, cardWidth, row.height)));
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

    const response = new ImageResponse(root, { width: WIDTH, height, fonts });
    images.push(Buffer.from(await response.arrayBuffer()));
  }
  return images;
}
