export enum DataForm {
  INT = 'int32_t',
  UINT = 'uint32_t',
  FLOAT = 'float',
  HEX = 'hex'
}

export enum DataAccessPermit {
  READ_ONLY = 'READ_ONLY',
  READ_WRITE = 'READ_WRITE'
}

export interface MapEntry {
  address: number;
  name: string;
  type: DataForm;
  isArray: boolean;
  arraySize?: number;
  accessPermit: DataAccessPermit;
  showAsHex: boolean;
}

export interface ParsedMap {
  entries: MapEntry[];
  readOnlyMaxIndex: number;
}

export function parseMapFile(content: string, isRegisterMap: boolean = false): ParsedMap {
  const lines = content.split('\n');
  const entries: MapEntry[] = [];
  let address = 0;
  let accessPermit = isRegisterMap ? DataAccessPermit.READ_ONLY : DataAccessPermit.READ_WRITE;
  let readOnlyMaxIndex = -1;
  
  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for read/write boundary in registers BEFORE skipping comments
    // This allows detecting the boundary even if it's in a comment like /***** read/write registers *****/
    // Accept both "read/write" and "read write" (with space) as boundary markers
    const lower = trimmedLine.toLowerCase();
    if (isRegisterMap && (lower.includes('read/write') || lower.includes('read write')) && !lower.includes('read only')) {
      readOnlyMaxIndex = address - 1;
      accessPermit = DataAccessPermit.READ_WRITE;
      continue;
    }

    // Skip empty lines and comments
    if (!trimmedLine ||
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('/*') ||
        trimmedLine.startsWith('*')) {
      continue;
    }

    // Remove inline comments
    let workingLine = trimmedLine;
    const commentIndex = workingLine.indexOf('//');
    if (commentIndex > 0) {
      workingLine = workingLine.substring(0, commentIndex).trim();
    }
    
    // Parse data declarations using regex to handle various formats
    const arrayMatch = workingLine.match(/(\w+)\s+(\w+)\[(\d+)\]/);
    const simpleMatch = workingLine.match(/(\w+)\s+(\w+);?\s*$/);
    
    if (arrayMatch) {
      // Array type: uint32_t ARRAY_NAME[size]
      const [, type, name, sizeStr] = arrayMatch;
      const arraySize = parseInt(sizeStr, 10);
      
      for (let i = 0; i < arraySize; i++) {
        entries.push({
          address: address++,
          name: `${name}[${i}]`,
          type: type as DataForm,
          isArray: true,
          arraySize,
          accessPermit,
          showAsHex: type === 'hex'
        });
      }
    } else if (simpleMatch) {
      // Simple type: uint32_t VARIABLE_NAME;
      const [, type, name] = simpleMatch;
      
      entries.push({
        address: address++,
        name,
        type: type as DataForm,
        isArray: false,
        accessPermit,
        showAsHex: type === 'hex'
      });
    }
  }
  
  return {
    entries,
    readOnlyMaxIndex
  };
}

export async function loadMapFile(filename: string): Promise<string> {
  try {
    const response = await fetch(`/maps/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Error loading map file ${filename}:`, error);
    throw error;
  }
}

// Board types map interface and parser
export interface BoardTypeEntry {
  id: number;
  name: string;
}

// Default board type definitions (fallback if no map file provided)
const DEFAULT_BOARD_TYPES: BoardTypeEntry[] = [
  { id: 0, name: 'Unknown' },
  { id: 1, name: 'Custom 1' },
  { id: 2, name: 'Custom 2' },
  { id: 3, name: 'Custom 3' }
];

/**
 * Parse board types map file
 * Expected format:
 * BOARD_TYPE_UNKNOWN = 0
 * BOARD_TYPE_CUSTOM_1 = 1
 * or with names:
 * BOARD_TYPE_PS_TRIGGER = 1, "PS Trigger Fanout"
 */
export function parseBoardTypesMap(content: string): BoardTypeEntry[] {
  if (!content || content.trim() === '') {
    return DEFAULT_BOARD_TYPES;
  }

  const lines = content.split('\n');
  const entries: BoardTypeEntry[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine ||
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('/*') ||
        trimmedLine.startsWith('*') ||
        trimmedLine.startsWith('}') ||
        trimmedLine.includes('typedef') ||
        trimmedLine.includes('enum')) {
      continue;
    }

    // Remove inline comments
    let workingLine = trimmedLine;
    const commentIndex = workingLine.indexOf('//');
    if (commentIndex > 0) {
      workingLine = workingLine.substring(0, commentIndex).trim();
    }

    // Remove trailing comma if present
    workingLine = workingLine.replace(/,$/, '');

    // Parse format: BOARD_TYPE_NAME = ID, "Display Name"
    const withNameMatch = workingLine.match(/(\w+)\s*=\s*(\d+)\s*,\s*"([^"]+)"/);
    if (withNameMatch) {
      const [, , idStr, displayName] = withNameMatch;
      entries.push({
        id: parseInt(idStr, 10),
        name: displayName
      });
      continue;
    }

    // Parse format: BOARD_TYPE_NAME = ID
    const simpleMatch = workingLine.match(/(\w+)\s*=\s*(\d+)/);
    if (simpleMatch) {
      const [, enumName, idStr] = simpleMatch;
      // Convert BOARD_TYPE_PS_TRIGGER to "PS Trigger"
      const name = enumName
        .replace(/^BOARD_TYPE_/, '')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

      entries.push({
        id: parseInt(idStr, 10),
        name
      });
    }
  }

  // Return defaults if parsing failed
  return entries.length > 0 ? entries : DEFAULT_BOARD_TYPES;
}

export function getDefaultBoardTypes(): BoardTypeEntry[] {
  return DEFAULT_BOARD_TYPES;
}