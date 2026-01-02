export enum DataForm {
  INT = 'int',
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
    
    // Check for read/write boundary in registers
    if (isRegisterMap && workingLine.toLowerCase().includes('read/write')) {
      readOnlyMaxIndex = address - 1;
      accessPermit = DataAccessPermit.READ_WRITE;
      continue;
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