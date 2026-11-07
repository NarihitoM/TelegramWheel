export interface Member {
  id: string;
  name: string;
  username?: string;
}

export interface SpinResult {
  teams: Member[][];
  leftovers: Member[];
}
