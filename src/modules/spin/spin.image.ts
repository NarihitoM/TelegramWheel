import { ImageResponse } from "@vercel/og";
import type { AvatarMap } from "../members/avatar.service.js";
import { IMAGE_FONT_FAMILY, loadImageFonts, toVisualOrder } from "./spin.fonts.js";
import type { Member, SpinResult } from "./spin.types.js";

type Style = Record<string, string | number>;

interface OgNode {
  type: string;
  props: {
    style?: Style;
    children?: string | OgNode | OgNode[];
    src?: string;
    width?: number;
    height?: number;
  };
}

const AVATAR_SIZE = 28;
const AVATAR_GAP = 10;

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

function initial(name: string): string {
  return ([...name.trim()][0] ?? "?").toUpperCase();
}

function avatar(member: Member, size: number, avatars: AvatarMap, color: string, style: Style = {}): OgNode {
  const shape: Style = { width: size, height: size, borderRadius: size / 2, flexShrink: 0, ...style };
  const src = avatars.get(member.id);
  if (src) {
    return { type: "img", props: { src, width: size, height: size, style: shape } };
  }
  return h(
    "div",
    {
      ...shape,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: color,
      color: "#ffffff",
      fontSize: Math.round(size * 0.5),
      fontWeight: 700,
    },
    initial(member.name),
  );
}

function card(segment: CardSegment, width: number, height: number, avatars: AvatarMap): OgNode {
  const names = segment.members.map((member, index) =>
    h("div", { display: "flex", alignItems: "flex-start" }, [
      avatar(member, AVATAR_SIZE, avatars, segment.color, {
        marginRight: AVATAR_GAP,
        marginTop: (NAME_HEIGHT - AVATAR_SIZE) / 2,
      }),
      h(
        "div",
        { ...NAME_STYLE, color: "#e5e7eb", flex: 1 },
        `${segment.firstNumber + index}. ${toVisualOrder(displayName(member.name))}`,
      ),
    ]),
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

export async function renderResultImages(
  result: SpinResult,
  chatTitle: string,
  avatars: AvatarMap = new Map(),
): Promise<Buffer[]> {
  const segments = buildSegments(result.teams);
  const columns = Math.min(segments.length, MAX_COLUMNS);
  const cardWidth = Math.floor((WIDTH - PADDING * 2 - GAP * (columns - 1)) / columns);
  const textWidth = cardWidth - CARD_INNER_PADDING * 2 - AVATAR_SIZE - AVATAR_GAP;
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

    const cards = page.flatMap((row) => row.segments.map((segment) => card(segment, cardWidth, row.height, avatars)));
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

const WINNER_COLUMNS = 2;
const MAX_WINNERS_IN_IMAGE = 30;
const WINNER_HEADER_HEIGHT = 230;
const WINNER_FONT_SIZE = 30;
const WINNER_LINE_HEIGHT = 42;
const WINNER_CARD_PADDING = 24;
const WINNER_AVATAR_SIZE = 64;
const SINGLE_WINNER_AVATAR_SIZE = 150;
const GOLD = "#fbbf24";

const CONFETTI = [
  { left: 60, top: 40, color: "#ef4444", rotate: 20 },
  { left: 180, top: 120, color: "#10b981", rotate: -30 },
  { left: 900, top: 30, color: "#3b82f6", rotate: 45 },
  { left: 1040, top: 110, color: "#ec4899", rotate: -15 },
  { left: 760, top: 150, color: "#f59e0b", rotate: 60 },
  { left: 1110, top: 40, color: "#8b5cf6", rotate: 10 },
  { left: 380, top: 30, color: "#14b8a6", rotate: -50 },
];

function confetti(): OgNode[] {
  return CONFETTI.map(({ left, top, color, rotate }) =>
    h("div", {
      display: "flex",
      position: "absolute",
      left,
      top,
      width: 14,
      height: 28,
      borderRadius: 4,
      backgroundColor: color,
      transform: `rotate(${rotate}deg)`,
    }),
  );
}

function winnerAvatar(member: Member, rank: number, single: boolean, avatars: AvatarMap): OgNode {
  const size = single ? SINGLE_WINNER_AVATAR_SIZE : WINNER_AVATAR_SIZE;
  const badge = single ? 52 : 28;
  return h(
    "div",
    {
      display: "flex",
      position: "relative",
      width: size,
      height: size,
      flexShrink: 0,
      marginRight: single ? 0 : 20,
      marginBottom: single ? 24 : 0,
    },
    [
      avatar(member, size, avatars, COLORS[(rank - 1) % COLORS.length] ?? GOLD, { border: `3px solid ${GOLD}` }),
      h(
        "div",
        {
          display: "flex",
          position: "absolute",
          right: -4,
          bottom: -4,
          alignItems: "center",
          justifyContent: "center",
          width: badge,
          height: badge,
          borderRadius: badge / 2,
          backgroundColor: GOLD,
          color: "#111827",
          fontSize: Math.round(badge * 0.55),
          fontWeight: 700,
        },
        String(rank),
      ),
    ],
  );
}

function winnerCard(
  member: Member,
  rank: number,
  width: number,
  height: number,
  single: boolean,
  avatars: AvatarMap,
): OgNode {
  const fontSize = single ? 64 : WINNER_FONT_SIZE;
  return h(
    "div",
    {
      display: "flex",
      flexDirection: single ? "column" : "row",
      alignItems: "center",
      justifyContent: single ? "center" : "flex-start",
      width,
      height,
      padding: WINNER_CARD_PADDING,
      borderRadius: 24,
      backgroundColor: "#1f2937",
      border: `3px solid ${GOLD}`,
    },
    [
      winnerAvatar(member, rank, single, avatars),
      h(
        "div",
        { display: "flex", flexDirection: "column", alignItems: single ? "center" : "flex-start", flex: 1 },
        [
          h(
            "div",
            {
              display: "block",
              fontSize,
              fontWeight: 700,
              lineHeight: `${Math.round(fontSize * 1.4)}px`,
              color: "#ffffff",
              wordBreak: "break-word",
              textAlign: single ? "center" : "left",
            },
            toVisualOrder(displayName(member.name)),
          ),
          ...(member.username
            ? [h("div", { display: "flex", fontSize: single ? 32 : 22, color: "#9ca3af", marginTop: 4 }, `@${member.username}`)]
            : []),
        ],
      ),
    ],
  );
}

function winnerCardHeight(member: Member, textWidth: number): number {
  const lines = estimateLines(displayName(member.name), textWidth, WINNER_FONT_SIZE);
  const username = member.username ? 30 : 0;
  return Math.max(WINNER_AVATAR_SIZE, lines * WINNER_LINE_HEIGHT + username) + WINNER_CARD_PADDING * 2 + 6;
}

export async function renderWinnersImage(
  winners: Member[],
  chatTitle: string,
  memberCount: number,
  avatars: AvatarMap = new Map(),
): Promise<Buffer> {
  const shown = winners.slice(0, MAX_WINNERS_IN_IMAGE);
  const single = shown.length === 1;
  const columns = single ? 1 : WINNER_COLUMNS;
  const cardWidth = Math.floor((WIDTH - PADDING * 2 - GAP * (columns - 1)) / columns);
  const textWidth = cardWidth - WINNER_CARD_PADDING * 2 - WINNER_AVATAR_SIZE - 20;
  const rows = chunk(shown, columns).map((members) => ({
    members,
    height: single ? 400 : Math.max(...members.map((member) => winnerCardHeight(member, textWidth))),
  }));
  const hidden = winners.length - shown.length;
  const height =
    WINNER_HEADER_HEIGHT + PADDING * 2 + rows.reduce((total, row) => total + row.height + GAP, 0) + (hidden > 0 ? 50 : 0);

  const title = winners.length === 1 ? "Winner" : "Winners";
  const subtitle = `${winners.length} ${winners.length === 1 ? "winner" : "winners"} picked from ${memberCount} members`;
  const fonts = await loadImageFonts([
    `${title} ${subtitle} more in text + @ 0123456789`,
    chatTitle,
    ...shown.flatMap((member) => [member.name, member.username ?? ""]),
  ]);

  let rank = 0;
  const cards = rows.flatMap((row) =>
    row.members.map((member) => {
      rank += 1;
      return winnerCard(member, rank, cardWidth, row.height, single, avatars);
    }),
  );

  const root = h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      width: WIDTH,
      height,
      padding: PADDING,
      backgroundColor: "#111827",
      color: "#ffffff",
      fontFamily: IMAGE_FONT_FAMILY,
    },
    [
      ...confetti(),
      h("div", { display: "flex", flexDirection: "column", alignItems: "center", height: WINNER_HEADER_HEIGHT }, [
        h("div", { display: "flex", fontSize: 72, fontWeight: 700, color: GOLD }, title),
        h("div", { display: "flex", fontSize: 28, color: "#9ca3af", marginTop: 8 }, toVisualOrder(chatTitle)),
        h("div", { display: "flex", fontSize: 24, color: "#6b7280", marginTop: 4 }, subtitle),
      ]),
      h("div", { display: "flex", flexWrap: "wrap", gap: GAP }, cards),
      ...(hidden > 0
        ? [h("div", { display: "flex", justifyContent: "center", fontSize: 24, color: "#9ca3af", marginTop: 16 }, `+${hidden} more in text`)]
        : []),
    ],
  );

  const response = new ImageResponse(root, { width: WIDTH, height, fonts });
  return Buffer.from(await response.arrayBuffer());
}
