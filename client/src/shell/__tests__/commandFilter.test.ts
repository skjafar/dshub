import { describe, it, expect } from 'vitest';
import type { SysCommand } from '../../types/settings';
import { filterCommands } from '../commandFilter';

function command(code: number, name: string): SysCommand {
  return { code, name };
}

const COMMANDS: readonly SysCommand[] = [
  command(10, 'HOME_ALL_AXES'),
  command(20, 'ENABLE_SPINDLE'),
  command(21, 'DISABLE_SPINDLE'),
  command(200, 'RESET_FAULTS'),
];

const names = (commands: readonly SysCommand[]): string[] => commands.map(c => c.name);

describe('filterCommands', () => {
  it('shows everything when nothing has been typed', () => {
    expect(filterCommands(COMMANDS, '')).toHaveLength(COMMANDS.length);
    expect(filterCommands(COMMANDS, '   ')).toHaveLength(COMMANDS.length);
  });

  it('matches part of a name, whatever case it was typed in', () => {
    expect(names(filterCommands(COMMANDS, 'spindle'))).toEqual([
      'ENABLE_SPINDLE',
      'DISABLE_SPINDLE',
    ]);
    expect(names(filterCommands(COMMANDS, 'HOME'))).toEqual(['HOME_ALL_AXES']);
  });

  it('matches part of a code', () => {
    // A code is searched as a substring rather than exactly: a Command's code
    // is not the thing an Engineer jumps to the way a Register's address is,
    // and a partial code is still worth matching on when many are defined.
    // '20' matches code 20 outright and code 200 as a leading substring, but
    // not 21, which does not contain it.
    expect(names(filterCommands(COMMANDS, '20'))).toEqual(['ENABLE_SPINDLE', 'RESET_FAULTS']);
  });

  it('matches a code exactly as well as any code containing it', () => {
    expect(names(filterCommands(COMMANDS, '200'))).toEqual(['RESET_FAULTS']);
  });

  it('returns nothing when a query matches nothing, rather than falling back to everything', () => {
    expect(filterCommands(COMMANDS, 'NO_SUCH_COMMAND')).toHaveLength(0);
  });
});
