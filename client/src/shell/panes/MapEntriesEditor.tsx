import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { DotsSixVertical, DownloadSimple, NotePencil, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry, ValueDescriptor } from '../../maps/mapParser';
import { Button, Popover, Select, Switch, TextField, cx } from '../../ui';
import { consolidateArrayEntries } from '../../utils/mapFileGenerator';
import type { EntryEdit } from './mapEditorDraft';
import styles from './MapEntriesEditor.module.css';

const TYPE_OPTIONS = [
  { value: DataForm.UINT, label: 'uint32_t' },
  { value: DataForm.INT, label: 'int32_t' },
  { value: DataForm.FLOAT, label: 'float' },
  { value: DataForm.HEX, label: 'hex' },
];

const ACCESS_OPTIONS = [
  { value: DataAccessPermit.READ_ONLY, label: 'Read-only' },
  { value: DataAccessPermit.READ_WRITE, label: 'Read/write' },
];

function baseName(name: string): string {
  return name.replace(/\[\d+\]$/, '');
}

interface NotesEditorProps {
  readonly entryName: string;
  readonly description: string;
  readonly valueList: readonly ValueDescriptor[];
  readonly readOnly: boolean;
  readonly onSave: (description: string, valueList: ValueDescriptor[]) => void;
}

/**
 * Description and named values, in a Popover rather than a dialog of their own.
 *
 * These two fields are the only ones that do not fit a table cell, and every
 * other field on this row commits inline — a dialog for just these two would
 * make one entry's edit look like two different kinds of action.
 */
function NotesEditor({ entryName, description, valueList, readOnly, onSave }: NotesEditorProps): React.JSX.Element {
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftValues, setDraftValues] = useState<ValueDescriptor[]>([...valueList]);

  // Reseeded whenever the entry's own saved notes change from outside this
  // Popover — a save elsewhere in the row, or a fresh Profile load.
  useEffect(() => {
    setDraftDescription(description);
    setDraftValues([...valueList]);
  }, [description, valueList]);

  const hasNotes = description !== '' || valueList.length > 0;

  const commit = (values: ValueDescriptor[] = draftValues): void => {
    onSave(draftDescription.trim(), values);
  };

  return (
    <Popover
      trigger={
        <Button
          variant="ghost"
          size="sm"
          aria-label={hasNotes ? `Edit description and values for ${entryName}` : `Add description and values for ${entryName}`}
        >
          <NotePencil size={14} weight={hasNotes ? 'fill' : 'regular'} />
        </Button>
      }
    >
      <div className={styles.notes}>
        <label className={styles.notesLabel} htmlFor={`notes-description-${entryName}`}>
          Description
        </label>
        <textarea
          id={`notes-description-${entryName}`}
          className={styles.notesTextarea}
          value={draftDescription}
          readOnly={readOnly}
          onChange={e => setDraftDescription(e.target.value)}
          onBlur={() => commit()}
          rows={3}
        />

        <div className={styles.notesHeader}>
          <span className={styles.notesLabel}>Value list</span>
          {!readOnly ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraftValues(previous => [...previous, { value: '', label: '' }])}
            >
              <Plus size={12} /> Add value
            </Button>
          ) : null}
        </div>

        {draftValues.length === 0 ? (
          <p className={styles.notesEmpty}>No named values.</p>
        ) : (
          draftValues.map((row, index) => (
            <div key={index} className={styles.notesRow}>
              <TextField
                aria-label={`Value ${index + 1} for ${entryName}`}
                placeholder="0"
                mono
                value={row.value}
                readOnly={readOnly}
                onChange={e =>
                  setDraftValues(previous => previous.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
                }
                onBlur={() => commit()}
              />
              <TextField
                aria-label={`Label ${index + 1} for ${entryName}`}
                placeholder="Meaning"
                value={row.label}
                readOnly={readOnly}
                onChange={e =>
                  setDraftValues(previous => previous.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))
                }
                onBlur={() => commit()}
              />
              {!readOnly ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove value ${index + 1} for ${entryName}`}
                  onClick={() => {
                    const next = draftValues.filter((_, i) => i !== index);
                    setDraftValues(next);
                    commit(next);
                  }}
                >
                  <Trash size={14} />
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Popover>
  );
}

interface EditableRowProps {
  /** A consolidated (one row per logical entry) `MapEntry`. */
  readonly entry: MapEntry;
  readonly isRegisterMap: boolean;
  readonly readOnly: boolean;
  readonly onChange: (edit: EntryEdit) => void;
  readonly onDelete: () => void;
}

function EditableRow({ entry, isRegisterMap, readOnly, onChange, onDelete }: EditableRowProps): React.JSX.Element {
  const stableId = baseName(entry.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stableId,
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Free-text fields hold their own draft, `null` while not being edited, and
  // commit on blur — the same shape `NumericInput` uses for a value under live
  // polling. It matters here for a different reason: an edit `mapEditorDraft`
  // refuses (a name collision, an out-of-range array size) leaves the entry
  // itself unchanged, and resetting the draft to `null` on every commit
  // attempt — accepted or refused — is what makes the field fall back to
  // showing the entry's real, unchanged value rather than going on displaying
  // whatever was typed and rejected.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [arraySizeDraft, setArraySizeDraft] = useState<string | null>(null);
  const [unitDraft, setUnitDraft] = useState<string | null>(null);

  const commitName = (): void => {
    const draft = nameDraft;
    setNameDraft(null);
    if (draft === null) return;
    const trimmed = draft.trim().toUpperCase();
    if (trimmed !== '' && trimmed !== stableId) onChange({ name: trimmed });
  };

  const commitArraySize = (): void => {
    const draft = arraySizeDraft;
    setArraySizeDraft(null);
    if (draft === null) return;
    const size = Number.parseInt(draft, 10);
    if (Number.isFinite(size)) onChange({ arraySize: size });
  };

  const commitUnit = (): void => {
    const draft = unitDraft;
    setUnitDraft(null);
    if (draft === null) return;
    onChange({ unit: draft.trim() || undefined });
  };

  return (
    <tr ref={setNodeRef} style={style} className={cx(styles.row, isDragging && styles.dragging)}>
      <td className={styles.handleCell}>
        {!readOnly ? (
          <button type="button" className={styles.handle} aria-label={`Reorder ${stableId}`} {...attributes} {...listeners}>
            <DotsSixVertical size={14} />
          </button>
        ) : null}
      </td>
      <td className={cx(styles.td, styles.numeric)}>{entry.address}</td>
      <td className={styles.td}>
        <TextField
          aria-label={`Name for ${stableId}`}
          value={nameDraft ?? stableId}
          mono
          readOnly={readOnly}
          onChange={e => setNameDraft(e.target.value.toUpperCase())}
          onBlur={commitName}
        />
      </td>
      <td className={styles.td}>
        <Select
          value={entry.type}
          onValueChange={type => onChange({ type })}
          options={TYPE_OPTIONS}
          aria-label={`Type for ${stableId}`}
          disabled={readOnly}
        />
      </td>
      <td className={cx(styles.td, styles.arrayCell)}>
        <Switch
          checked={entry.isArray}
          onCheckedChange={isArray => onChange({ isArray, arraySize: isArray ? entry.arraySize ?? 1 : undefined })}
          aria-label={`Array toggle for ${stableId}`}
          disabled={readOnly}
        />
        <TextField
          aria-label={`Array size for ${stableId}`}
          mono
          value={arraySizeDraft ?? String(entry.arraySize ?? 1)}
          disabled={!entry.isArray || readOnly}
          onChange={e => setArraySizeDraft(e.target.value)}
          onBlur={commitArraySize}
        />
      </td>
      <td className={styles.td}>
        <TextField
          aria-label={`Unit for ${stableId}`}
          value={unitDraft ?? entry.unit ?? ''}
          readOnly={readOnly}
          placeholder="unit"
          onChange={e => setUnitDraft(e.target.value)}
          onBlur={commitUnit}
        />
      </td>
      <td className={styles.td}>
        {isRegisterMap ? (
          <Select
            value={entry.accessPermit}
            onValueChange={accessPermit => onChange({ accessPermit })}
            options={ACCESS_OPTIONS}
            aria-label={`Access for ${stableId}`}
            disabled={readOnly}
          />
        ) : null}
      </td>
      <td className={cx(styles.td, styles.actions)}>
        <NotesEditor
          entryName={stableId}
          description={entry.description ?? ''}
          valueList={entry.valueList ?? []}
          readOnly={readOnly}
          onSave={(description, valueList) =>
            onChange({
              description: description || undefined,
              valueList: valueList.length > 0 ? valueList : undefined,
            })
          }
        />
        {!readOnly ? (
          <Button variant="ghost" size="sm" aria-label={`Delete ${stableId}`} onClick={onDelete}>
            <Trash size={14} />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

export interface MapEntriesEditorProps {
  /** The Map's own entries, expanded — one row per wire entry, as `mapParser` produces. */
  readonly entries: readonly MapEntry[];
  readonly isRegisterMap: boolean;
  readonly readOnly: boolean;
  readonly onAdd: () => void;
  readonly onChange: (target: MapEntry, edit: EntryEdit) => void;
  readonly onDelete: (target: MapEntry) => void;
  readonly onReorder: (oldIndex: number, newIndex: number) => void;
  readonly onImportFile: (file: File) => void;
  readonly onExportMap: () => void;
  readonly onExportHeader: () => void;
  /** The last edit this space's draft refused, if any. */
  readonly error: string | null;
}

/**
 * One Address Space's entries as an editable, reorderable table.
 *
 * Serves both Registers and Parameters, the same way `Entries.tsx` does for
 * reading them — the difference between the two here is only whether the
 * Access column means anything and what a freshly added entry defaults to.
 */
export function MapEntriesEditor({
  entries,
  isRegisterMap,
  readOnly,
  onAdd,
  onChange,
  onDelete,
  onReorder,
  onImportFile,
  onExportMap,
  onExportHeader,
  error,
}: MapEntriesEditorProps): React.JSX.Element {
  const consolidated = useMemo(() => consolidateArrayEntries([...entries]), [entries]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = consolidated.findIndex(e => baseName(e.name) === active.id);
    const newIndex = consolidated.findIndex(e => baseName(e.name) === over.id);
    if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex);
  };

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <Button size="sm" onClick={onAdd} disabled={readOnly}>
          <Plus size={14} /> Add entry
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={readOnly}>
          <UploadSimple size={14} /> Import .map
        </Button>
        <Button size="sm" variant="secondary" onClick={onExportMap} disabled={entries.length === 0}>
          <DownloadSimple size={14} /> Export .map
        </Button>
        <Button size="sm" variant="secondary" onClick={onExportHeader} disabled={entries.length === 0}>
          <DownloadSimple size={14} /> Export header
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".map"
          className={styles.hiddenInput}
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onImportFile(file);
          }}
        />
      </div>

      {error !== null ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.tableHost}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={consolidated.map(e => baseName(e.name))} strategy={verticalListSortingStrategy}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} aria-hidden />
                  <th className={cx(styles.th, styles.numeric)}>Addr</th>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th}>Array</th>
                  <th className={styles.th}>Unit</th>
                  <th className={styles.th}>{isRegisterMap ? 'Access' : ''}</th>
                  <th className={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {consolidated.length === 0 ? (
                  <tr>
                    <td className={styles.empty} colSpan={8}>
                      No entries yet. Add one to get started.
                    </td>
                  </tr>
                ) : (
                  consolidated.map(entry => (
                    <EditableRow
                      key={baseName(entry.name)}
                      entry={entry}
                      isRegisterMap={isRegisterMap}
                      readOnly={readOnly}
                      onChange={edit => onChange(entry, edit)}
                      onDelete={() => onDelete(entry)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
