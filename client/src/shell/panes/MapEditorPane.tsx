import { useCallback, useEffect, useMemo } from 'react';
import { useBackendPort } from '../../contexts/BackendPortContext';
import { useSettings } from '../../contexts/SettingsContext';
import { parseMapFile } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { CNC_PROFILE_ID, DEFAULT_PROFILE_ID } from '../../types/settings';
import type { MapProfile, SysCommand } from '../../types/settings';
import { generateHeaderFile } from '../../utils/headerFileGenerator';
import { generateMapFile } from '../../utils/mapFileGenerator';
import {
  DS_SYS_COMMANDS,
  generateSysCommandHeaderFile,
  generateSysCommandMapFile,
} from '../../utils/sysCommandFileGenerator';
import type { PaneProps } from '../paneRegistry';
import { usePaneState } from '../paneState';
import { announceMapEdited } from '../useMapEntries';
import { MapEditor } from './MapEditor';
import type { MapEditorTab } from './MapEditor';
import {
  MAX_ENTRIES,
  addEntry,
  applyMetadata,
  deleteEntry,
  extractMetadata,
  isRegisterOrderValid,
  reorderEntries,
  updateEntry,
} from './mapEditorDraft';
import type { EntryEdit } from './mapEditorDraft';

type Space = 'register' | 'parameter';

interface MapEditorPaneState {
  readonly tab: MapEditorTab;
  /** Which Profile `registerEntries`/`parameterEntries`/`commands` were seeded from. */
  readonly loadedProfileId: string | null;
  readonly registerEntries: readonly MapEntry[];
  readonly parameterEntries: readonly MapEntry[];
  readonly commands: readonly SysCommand[];
  readonly dirty: boolean;
  /** The last edit each space's draft refused, if any. */
  readonly registerError: string | null;
  readonly parameterError: string | null;
  readonly commandsError: string | null;
}

const INITIAL_STATE: MapEditorPaneState = {
  tab: 'registers',
  loadedProfileId: null,
  registerEntries: [],
  parameterEntries: [],
  commands: [],
  dirty: false,
  registerError: null,
  parameterError: null,
  commandsError: null,
};

function entriesOf(state: MapEditorPaneState, space: Space): readonly MapEntry[] {
  return space === 'register' ? state.registerEntries : state.parameterEntries;
}

function withEntries(state: MapEditorPaneState, space: Space, entries: readonly MapEntry[]): MapEditorPaneState {
  return space === 'register'
    ? { ...state, registerEntries: entries, dirty: true }
    : { ...state, parameterEntries: entries, dirty: true };
}

function withError(state: MapEditorPaneState, space: Space, error: string | null): MapEditorPaneState {
  return space === 'register' ? { ...state, registerError: error } : { ...state, parameterError: error };
}

/** The Registers, Parameters and Commands a fresh draft of this Profile starts from. */
interface ProfileDraft {
  readonly registerEntries: readonly MapEntry[];
  readonly parameterEntries: readonly MapEntry[];
  readonly commands: readonly SysCommand[];
}

function draftFromProfile(profile: MapProfile): ProfileDraft {
  return {
    registerEntries: applyMetadata(parseMapFile(profile.registersMap, true).entries, profile.registersMetadata ?? {}),
    parameterEntries: applyMetadata(
      parseMapFile(profile.parametersMap, false).entries,
      profile.parametersMetadata ?? {}
    ),
    commands: profile.sysCommands ?? [],
  };
}

/**
 * The last library-reserved Command code — `sysCommandFileGenerator.ts`'s own
 * boundary: `65000`–`65535` is where `DS_SYS_COMMANDS` lives.
 */
const MAX_CUSTOM_COMMAND_CODE = 64999;

/**
 * Why a Command code cannot be used, or null when it can — checked against the
 * draft's own Commands and the built-in library ones first, so a code that
 * collides with a *known* reserved Command names that reason specifically
 * rather than folding it into the generic out-of-range case below.
 */
function commandCodeConflict(code: number, commands: readonly SysCommand[], excludingIndex: number): string | null {
  if (!Number.isInteger(code) || code < 0) {
    return 'Code must be a whole, non-negative number.';
  }
  if (commands.some((c, i) => c.code === code && i !== excludingIndex)) {
    return `Code ${code} is already used by another Command in this Profile.`;
  }
  if (DS_SYS_COMMANDS.some(c => c.code === code)) {
    return `Code ${code} is reserved for a built-in library Command.`;
  }
  if (code > MAX_CUSTOM_COMMAND_CODE) {
    return `Code must be ${MAX_CUSTOM_COMMAND_CODE} or lower — ${MAX_CUSTOM_COMMAND_CODE + 1}–65535 is reserved for the library.`;
  }
  return null;
}

/**
 * Binds the Map Editor to the active Profile, the shared draft-edit rules in
 * `mapEditorDraft.ts`, and the port.
 *
 * Editing always targets the *active* Profile — there is no Profile picker
 * here the way the pre-rebuild full-screen editor needed one, because
 * switching Profile is now a chrome-level action (`ProfilesDialog`) that
 * re-skins the whole Workspace, this Pane included. A singleton, like the
 * Inspector: there is one Profile's Map to edit at a time.
 */
export function MapEditorPane({ paneId, setTitle }: PaneProps): React.JSX.Element {
  const { getActiveProfile, updateProfile } = useSettings();
  const port = useBackendPort();

  const [pane, updatePane] = usePaneState<MapEditorPaneState>(paneId, () => INITIAL_STATE);

  const profile = getActiveProfile();
  const isBuiltIn = profile !== null && (profile.id === DEFAULT_PROFILE_ID || profile.id === CNC_PROFILE_ID);
  const canEdit = profile !== null && !isBuiltIn;
  const readOnlyReason = useMemo(() => {
    if (profile === null) return 'No Profile is active — nothing to edit.';
    if (isBuiltIn) return 'Built-in Profiles cannot be edited. Create or switch to a custom Profile to make changes.';
    return null;
  }, [profile, isBuiltIn]);

  useEffect(() => {
    setTitle(pane.dirty ? 'Map Editor · unsaved' : 'Map Editor');
  }, [setTitle, pane.dirty]);

  // (Re)seeds the draft whenever the active Profile is one this Pane has not
  // already loaded a draft for — a genuine Profile switch, or this Pane's
  // first mount. Per-instance state is itself scoped to a Profile's own saved
  // Workspace (`workspaceStore.ts`), so switching Profile always remounts
  // this Pane against a draft that either belongs to the new Profile already
  // or has not been loaded at all; this effect only ever fires for the latter.
  useEffect(() => {
    if (profile === null) return;
    if (pane.loadedProfileId === profile.id) return;
    updatePane(previous => ({
      ...previous,
      loadedProfileId: profile.id,
      ...draftFromProfile(profile),
      dirty: false,
      registerError: null,
      parameterError: null,
      commandsError: null,
    }));
  }, [profile, pane.loadedProfileId, updatePane]);

  const handleEntryAdd = useCallback(
    (space: Space) => {
      if (!canEdit) return;
      updatePane(previous => {
        const result = addEntry(entriesOf(previous, space), space === 'register');
        return result.kind === 'ok'
          ? withError(withEntries(previous, space, result.entries), space, null)
          : withError(previous, space, result.error);
      });
    },
    [canEdit, updatePane]
  );

  const handleEntryChange = useCallback(
    (space: Space, target: MapEntry, edit: EntryEdit) => {
      if (!canEdit) return;
      updatePane(previous => {
        const result = updateEntry(target, entriesOf(previous, space), edit);
        return result.kind === 'ok'
          ? withError(withEntries(previous, space, result.entries), space, null)
          : withError(previous, space, result.error);
      });
    },
    [canEdit, updatePane]
  );

  const handleEntryDelete = useCallback(
    (space: Space, target: MapEntry) => {
      if (!canEdit) return;
      updatePane(previous => withEntries(previous, space, deleteEntry(target, entriesOf(previous, space))));
    },
    [canEdit, updatePane]
  );

  const handleReorder = useCallback(
    (space: Space, oldIndex: number, newIndex: number) => {
      if (!canEdit) return;
      updatePane(previous => {
        const result = reorderEntries(entriesOf(previous, space), oldIndex, newIndex, space === 'register');
        return result.kind === 'ok'
          ? withError(withEntries(previous, space, result.entries), space, null)
          : withError(previous, space, result.error);
      });
    },
    [canEdit, updatePane]
  );

  const handleImportFile = useCallback(
    (space: Space, file: File) => {
      if (!canEdit) return;
      const reader = new FileReader();
      reader.onload = event => {
        const content = event.target?.result;
        if (typeof content !== 'string') return;
        const parsed = parseMapFile(content, space === 'register');
        if (parsed.entries.length > MAX_ENTRIES) {
          updatePane(previous =>
            withError(previous, space, `This file has ${parsed.entries.length} entries, exceeding the maximum of ${MAX_ENTRIES}.`)
          );
          return;
        }
        if (space === 'register' && !isRegisterOrderValid(parsed.entries)) {
          updatePane(previous =>
            withError(previous, space, 'Read-only Registers must be listed before read-write ones. Import refused.')
          );
          return;
        }
        // Bad individual lines are skipped rather than refusing the whole
        // file (matching the pre-rebuild editor) — but skipped silently is
        // exactly the kind of gap ticket 19 asks Profile import to never
        // leave, so the draft still says so rather than looking untouched.
        const warning =
          parsed.errors.length === 0
            ? null
            : `Imported with ${parsed.errors.length} issue${parsed.errors.length === 1 ? '' : 's'} — the affected line${parsed.errors.length === 1 ? '' : 's'} were skipped.`;
        updatePane(previous => {
          // Metadata (description/unit/value list) lives redundantly on each
          // draft entry, extracted into the Profile's own metadata dict only
          // at save time (`extractMetadata`, in `handleSave` below) — a raw
          // parse carries none of it at all. Re-applying whatever the
          // *current* draft holds, by name, is what makes this a genuine
          // carry-for-surviving-names-drop-the-rest (`.scratch/map-binding-drift`,
          // ticket 05), rather than silently discarding every entry's
          // metadata, including names that did survive the replacement.
          const carriedOver = applyMetadata(parsed.entries, extractMetadata(entriesOf(previous, space)));
          return withError(withEntries(previous, space, carriedOver), space, warning);
        });
      };
      reader.readAsText(file);
    },
    [canEdit, updatePane]
  );

  const handleExportMap = useCallback(
    (space: Space) => {
      const entries = [...entriesOf(pane, space)];
      const content = generateMapFile(entries, space === 'register');
      void port.files.saveText({
        content,
        suggestedName: space === 'register' ? 'registers.map' : 'parameters.map',
        filterName: 'Map File',
        filterExt: 'map',
      });
    },
    [pane, port]
  );

  const handleExportHeader = useCallback(
    (space: Space) => {
      const entries = [...entriesOf(pane, space)];
      const content = generateHeaderFile(entries, space === 'register', profile?.name ?? 'Custom');
      void port.files.saveText({
        content,
        suggestedName: space === 'register' ? 'ds_register_names.h' : 'ds_parameter_names.h',
        filterName: 'C Header',
        filterExt: 'h',
      });
    },
    [pane, profile, port]
  );

  const handleCommandAdd = useCallback(() => {
    if (!canEdit) return;
    updatePane(previous => {
      const used = new Set(previous.commands.map(c => c.code));
      let code = 0;
      while (used.has(code)) code += 1;
      return { ...previous, dirty: true, commands: [...previous.commands, { code, name: `NEW_COMMAND_${code}` }] };
    });
  }, [canEdit, updatePane]);

  const handleCommandChange = useCallback(
    (index: number, patch: Partial<SysCommand>) => {
      if (!canEdit) return;
      updatePane(previous => {
        if (patch.code !== undefined) {
          const conflict = commandCodeConflict(patch.code, previous.commands, index);
          if (conflict !== null) return { ...previous, commandsError: conflict };
        }
        return {
          ...previous,
          dirty: true,
          commandsError: null,
          commands: previous.commands.map((command, i) => (i === index ? { ...command, ...patch } : command)),
        };
      });
    },
    [canEdit, updatePane]
  );

  const handleCommandDelete = useCallback(
    (index: number) => {
      if (!canEdit) return;
      updatePane(previous => ({ ...previous, dirty: true, commands: previous.commands.filter((_, i) => i !== index) }));
    },
    [canEdit, updatePane]
  );

  const handleExportCommandsMap = useCallback(() => {
    void port.files.saveText({
      content: generateSysCommandMapFile([...pane.commands]),
      suggestedName: 'syscommands.map',
      filterName: 'Map File',
      filterExt: 'map',
    });
  }, [pane.commands, port]);

  const handleExportCommandsHeader = useCallback(() => {
    void port.files.saveText({
      content: generateSysCommandHeaderFile([...pane.commands], profile?.name ?? 'Custom'),
      suggestedName: 'ds_sys_commands.h',
      filterName: 'C Header',
      filterExt: 'h',
    });
  }, [pane.commands, profile, port]);

  const handleSave = useCallback(() => {
    if (!canEdit || profile === null) return;
    if (!isRegisterOrderValid(pane.registerEntries)) {
      updatePane(previous =>
        withError(previous, 'register', 'Read-only Registers must be listed before read-write ones. Fix the order before saving.')
      );
      return;
    }

    const registersContent = generateMapFile([...pane.registerEntries], true);
    const parametersContent = generateMapFile([...pane.parameterEntries], false);
    const registersMetadata = extractMetadata(pane.registerEntries);
    const parametersMetadata = extractMetadata(pane.parameterEntries);
    const commands = [...pane.commands];

    const saved = updateProfile(
      profile.id,
      registersContent,
      parametersContent,
      commands,
      profile.boardTypesMap,
      registersMetadata,
      parametersMetadata
    );
    if (!saved) return;

    // Reparses the just-saved content into the manager every other open Pane
    // reads from — a write that reaches the Profile but not `mapManager`
    // would leave the Registers Pane showing names that no longer match what
    // was just saved.
    announceMapEdited({
      ...profile,
      registersMap: registersContent,
      parametersMap: parametersContent,
      sysCommands: commands,
      registersMetadata,
      parametersMetadata,
    });

    updatePane(previous => ({ ...previous, dirty: false }));
  }, [canEdit, profile, pane.registerEntries, pane.parameterEntries, pane.commands, updateProfile, updatePane]);

  const handleReset = useCallback(() => {
    if (profile === null) return;
    updatePane(previous => ({
      ...previous,
      loadedProfileId: profile.id,
      ...draftFromProfile(profile),
      dirty: false,
      registerError: null,
      parameterError: null,
      commandsError: null,
    }));
  }, [profile, updatePane]);

  return (
    <MapEditor
      tab={pane.tab}
      onTabChange={tab => updatePane(previous => ({ ...previous, tab }))}
      profileName={profile?.name ?? null}
      readOnly={!canEdit}
      readOnlyReason={readOnlyReason}
      dirty={pane.dirty}
      onSave={handleSave}
      onReset={handleReset}
      registers={{
        entries: pane.registerEntries,
        isRegisterMap: true,
        readOnly: !canEdit,
        onAdd: () => handleEntryAdd('register'),
        onChange: (target, edit) => handleEntryChange('register', target, edit),
        onDelete: target => handleEntryDelete('register', target),
        onReorder: (oldIndex, newIndex) => handleReorder('register', oldIndex, newIndex),
        onImportFile: file => handleImportFile('register', file),
        onExportMap: () => handleExportMap('register'),
        onExportHeader: () => handleExportHeader('register'),
        error: pane.registerError,
      }}
      parameters={{
        entries: pane.parameterEntries,
        isRegisterMap: false,
        readOnly: !canEdit,
        onAdd: () => handleEntryAdd('parameter'),
        onChange: (target, edit) => handleEntryChange('parameter', target, edit),
        onDelete: target => handleEntryDelete('parameter', target),
        onReorder: (oldIndex, newIndex) => handleReorder('parameter', oldIndex, newIndex),
        onImportFile: file => handleImportFile('parameter', file),
        onExportMap: () => handleExportMap('parameter'),
        onExportHeader: () => handleExportHeader('parameter'),
        error: pane.parameterError,
      }}
      commands={{
        commands: pane.commands,
        readOnly: !canEdit,
        onAdd: handleCommandAdd,
        onChange: handleCommandChange,
        onDelete: handleCommandDelete,
        onExportMap: handleExportCommandsMap,
        onExportHeader: handleExportCommandsHeader,
        error: pane.commandsError,
      }}
    />
  );
}
