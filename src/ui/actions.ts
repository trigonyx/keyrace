import type { PickOption, PickOpts } from '../commands/registry.js';
import type { NoteKind } from '../core/store.js';
import type { RaceSettings } from '../game/types.js';

/** What the screens need from the app (prompts, commands, races). */
export interface Actions {
  quit(): void;
  confirm(title: string): Promise<boolean>;
  prompt(title: string, opts?: { hint?: string; initial?: string }): Promise<string | null>;
  pick(title: string, options: PickOption[], multi: boolean, opts?: PickOpts): Promise<string[] | null>;
  chooseMode(title: string, initial?: RaceSettings): Promise<RaceSettings | null>;
  /** Mode dialog, then the friends to invite (none = solo). */
  newRace(preselect?: string[]): Promise<void>;
  /** Solo practice: mode dialog, then straight to the countdown. */
  soloRace(): Promise<void>;
  runCommand(input: string, selectedId: string | null): Promise<void>;
  print(text: string, kind?: NoteKind): void;
}
