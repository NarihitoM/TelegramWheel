import type { Member, SpinResult } from "./spin.types.js";

const MAX_MESSAGE_LENGTH = 4000;
export const MAX_TEXT_MESSAGES = 8;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function describeSplit(teamCount: number, teamSize: number, memberCount: number): string {
  const main = `${plural(teamCount, "group")}, each with ${plural(teamSize, "member")}`;
  const extra = memberCount - teamCount * teamSize;
  return extra > 0 ? `${main}, plus 1 extra group with ${plural(extra, "member")}` : main;
}

function memberLine(member: Member, index: number): string {
  const username = member.username ? ` (@${member.username})` : "";
  return `${index + 1}. ${escapeHtml(member.name)}${username}`;
}

function headerLines(result: SpinResult, chatTitle: string, teamCount: number, teamSize: number): string[] {
  const total = result.teams.flat().length;
  return [
    "<b>Spin Wheel Result</b>",
    escapeHtml(chatTitle),
    `${describeSplit(teamCount, teamSize, total)}.`,
    `Total groups: ${result.teams.length} | Total members: ${total}`,
  ];
}

export function formatResult(result: SpinResult, chatTitle: string, teamCount: number, teamSize: number): string[] {
  const lines = headerLines(result, chatTitle, teamCount, teamSize);
  result.teams.forEach((team, index) => {
    lines.push("", `<b>Group ${index + 1}</b>`, ...team.map(memberLine));
  });
  return chunkLines(lines, MAX_MESSAGE_LENGTH);
}

export function formatSummary(result: SpinResult, chatTitle: string, teamCount: number, teamSize: number): string {
  return [
    ...headerLines(result, chatTitle, teamCount, teamSize),
    "",
    "The full list is too long for chat messages, so it is attached as a file.",
  ].join("\n");
}

function winnerHeader(winnerCount: number, chatTitle: string, memberCount: number): string[] {
  return [
    `<b>${winnerCount === 1 ? "Winner" : "Winners"}</b>`,
    escapeHtml(chatTitle),
    `${plural(winnerCount, "winner")} picked from ${plural(memberCount, "member")}.`,
  ];
}

export function formatWinners(winners: Member[], chatTitle: string, memberCount: number): string[] {
  return chunkLines(
    [...winnerHeader(winners.length, chatTitle, memberCount), "", ...winners.map(memberLine)],
    MAX_MESSAGE_LENGTH,
  );
}

export function formatWinnersSummary(winners: Member[], chatTitle: string, memberCount: number): string {
  return [
    ...winnerHeader(winners.length, chatTitle, memberCount),
    "",
    "The full list is too long for chat messages, so it is attached as a file.",
  ].join("\n");
}

export function toPlainText(chunks: string[]): string {
  return chunks
    .join("\n")
    .replace(/<\/?b>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function chunkLines(lines: string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}
