/**
 * Narrowing a Command catalogue down to the ones someone is looking for.
 *
 * A Profile can define many Commands, so the Pane exists to be searched rather
 * than scrolled — ticket 11's own wording. Unlike an address, a Command's code is
 * not the thing being sought as often as its name is, so both read as substrings
 * rather than the exact-match reserved for `entryFilter.ts`'s hexadecimal
 * addresses: nobody is asking to jump to code `65000` the way an Engineer jumps
 * to a register address, and a partial code is still worth matching on.
 */

import type { SysCommand } from '../types/settings';

function matchesQuery(command: SysCommand, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return true;

  if (command.name.toLowerCase().includes(trimmed)) return true;
  return String(command.code).includes(trimmed);
}

/** The Commands answering a query, in the catalogue's own order. */
export function filterCommands(
  commands: readonly SysCommand[],
  query: string
): readonly SysCommand[] {
  if (query.trim() === '') return commands;
  return commands.filter(command => matchesQuery(command, query));
}
