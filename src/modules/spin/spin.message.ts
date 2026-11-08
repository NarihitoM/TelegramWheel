import type { Member, SpinResult } from "./spin.types.js";

const MAX_MESSAGE_LENGTH = 4000;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plural(count: number, word: string): string {
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

export function formatResult(result: SpinResult, chatTitle: string, teamCount: number, teamSize: number): string[] {
  const total = result.teams.flat().length;
  const lines = [
    "<b>Spin Wheel Result</b>",
    escapeHtml(chatTitle),
    `${describeSplit(teamCount, teamSize, total)}.`,
    `Total groups: ${result.teams.length} | Total members: ${total}`,
  ];

  result.teams.forEach((team, index) => {
    lines.push("", `<b>Group ${index + 1}</b>`, ...team.map(memberLine));
  });

  return chunkLines(lines, MAX_MESSAGE_LENGTH);
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
