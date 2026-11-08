import type { Member, SpinResult } from "./spin.types.js";

const MAX_MESSAGE_LENGTH = 4000;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function describeSplit(teamCount: number, teamSize: number): string {
  return `${plural(teamCount, "group")}, each with ${plural(teamSize, "member")}`;
}

function memberLine(member: Member, index: number): string {
  const username = member.username ? ` (@${member.username})` : "";
  return `${index + 1}. ${escapeHtml(member.name)}${username}`;
}

export function formatResult(result: SpinResult, chatTitle: string): string[] {
  const teamSize = result.teams[0]?.length ?? 0;
  const total = result.teams.flat().length + result.leftovers.length;
  const lines = [
    "<b>Spin Wheel Result</b>",
    escapeHtml(chatTitle),
    `${describeSplit(result.teams.length, teamSize)} (${plural(total, "member")} total)`,
  ];

  result.teams.forEach((team, index) => {
    lines.push("", `<b>Group ${index + 1}</b>`, ...team.map(memberLine));
  });

  if (result.leftovers.length > 0) {
    lines.push("", "<b>Not picked</b>", ...result.leftovers.map(memberLine));
  }

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
