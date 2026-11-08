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

export function pickWinners(members: readonly Member[], count: number, random: RandomInt = randomInt): Member[] {
  if (!Number.isInteger(count) || count < 1 || count >= members.length) {
    throw new Error(`Cannot pick ${count} winners from ${members.length} members`);
  }
  return shuffle(members, random).slice(0, count);
}

export type CoinSide = "Heads" | "Tails";

export function flipCoin(random: RandomInt = randomInt): CoinSide {
  return random(2) === 0 ? "Heads" : "Tails";
}
