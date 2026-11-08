import { randomInt } from "node:crypto";
import type { Member, SpinResult } from "./spin.types.js";

type RandomInt = (max: number) => number;

export function shuffle<T>(items: readonly T[], random: RandomInt = randomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export function isValidConfig(memberCount: number, teamCount: number, teamSize: number): boolean {
  return (
    Number.isInteger(teamCount) &&
    Number.isInteger(teamSize) &&
    teamCount >= 2 &&
    teamSize >= 1 &&
    teamCount * teamSize <= memberCount
  );
}

export function splitIntoTeams(
  members: readonly Member[],
  teamCount: number,
  teamSize: number,
  random: RandomInt = randomInt,
): SpinResult {
  if (!isValidConfig(members.length, teamCount, teamSize)) {
    throw new Error(`Cannot split ${members.length} members into ${teamCount} groups of ${teamSize}`);
  }

  const shuffled = shuffle(members, random);
  const teams = Array.from({ length: teamCount }, (_, index) =>
    shuffled.slice(index * teamSize, (index + 1) * teamSize),
  );
  const extra = shuffled.slice(teamCount * teamSize);
  if (extra.length > 0) {
    teams.push(extra);
  }

  return { teams };
}
