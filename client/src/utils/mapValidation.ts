import { CustomMaps, RegisterMapItem, ParameterMapItem } from '../types/settings';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const VALID_TYPES = ['uint32_t', 'int32_t', 'float', 'int', 'uint', 'hex'];
const VALID_ACCESS = ['R', 'RW', 'W'];

function validateMapItem(
  item: RegisterMapItem | ParameterMapItem,
  index: number,
  type: 'register' | 'parameter'
): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `${type}[${index}]`;

  // Validate address
  if (typeof item.address !== 'number') {
    errors.push({ field: `${prefix}.address`, message: 'Address must be a number' });
  } else if (item.address < 0) {
    errors.push({ field: `${prefix}.address`, message: 'Address cannot be negative' });
  } else if (!Number.isInteger(item.address)) {
    errors.push({ field: `${prefix}.address`, message: 'Address must be an integer' });
  } else if (item.address > 65535) {
    errors.push({ field: `${prefix}.address`, message: 'Address exceeds maximum value (65535)' });
  }

  // Validate name
  if (typeof item.name !== 'string') {
    errors.push({ field: `${prefix}.name`, message: 'Name must be a string' });
  } else if (item.name.trim() === '') {
    errors.push({ field: `${prefix}.name`, message: 'Name cannot be empty' });
  } else if (!/^[A-Z][A-Z0-9_]*$/.test(item.name)) {
    errors.push({
      field: `${prefix}.name`,
      message: 'Name must start with uppercase letter and contain only uppercase letters, numbers, and underscores'
    });
  }

  // Validate type
  if (typeof item.type !== 'string') {
    errors.push({ field: `${prefix}.type`, message: 'Type must be a string' });
  } else if (!VALID_TYPES.includes(item.type)) {
    errors.push({
      field: `${prefix}.type`,
      message: `Type must be one of: ${VALID_TYPES.join(', ')}`
    });
  }

  // Validate access
  if (typeof item.access !== 'string') {
    errors.push({ field: `${prefix}.access`, message: 'Access must be a string' });
  } else if (!VALID_ACCESS.includes(item.access)) {
    errors.push({
      field: `${prefix}.access`,
      message: `Access must be one of: ${VALID_ACCESS.join(', ')}`
    });
  }

  return errors;
}

function checkDuplicates(
  items: (RegisterMapItem | ParameterMapItem)[],
  type: 'register' | 'parameter'
): ValidationError[] {
  const errors: ValidationError[] = [];
  const addressMap = new Map<number, number[]>();
  const nameMap = new Map<string, number[]>();

  items.forEach((item, index) => {
    // Check duplicate addresses
    if (!addressMap.has(item.address)) {
      addressMap.set(item.address, []);
    }
    addressMap.get(item.address)!.push(index);

    // Check duplicate names
    if (!nameMap.has(item.name)) {
      nameMap.set(item.name, []);
    }
    nameMap.get(item.name)!.push(index);
  });

  // Report duplicates
  addressMap.forEach((indices, address) => {
    if (indices.length > 1) {
      errors.push({
        field: `${type}s`,
        message: `Duplicate address ${address} found at indices: ${indices.join(', ')}`
      });
    }
  });

  nameMap.forEach((indices, name) => {
    if (indices.length > 1) {
      errors.push({
        field: `${type}s`,
        message: `Duplicate name "${name}" found at indices: ${indices.join(', ')}`
      });
    }
  });

  return errors;
}

export function validateCustomMaps(maps: CustomMaps): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check that at least one map type is provided
  if (!maps.registers && !maps.parameters) {
    errors.push({
      field: 'root',
      message: 'Custom maps must contain at least "registers" or "parameters" array'
    });
    return { valid: false, errors, warnings };
  }

  // Validate registers
  if (maps.registers) {
    if (!Array.isArray(maps.registers)) {
      errors.push({ field: 'registers', message: 'Registers must be an array' });
    } else {
      if (maps.registers.length === 0) {
        warnings.push({ field: 'registers', message: 'Registers array is empty' });
      }

      maps.registers.forEach((item, index) => {
        errors.push(...validateMapItem(item, index, 'register'));
      });

      // Check for duplicates
      errors.push(...checkDuplicates(maps.registers, 'register'));
    }
  }

  // Validate parameters
  if (maps.parameters) {
    if (!Array.isArray(maps.parameters)) {
      errors.push({ field: 'parameters', message: 'Parameters must be an array' });
    } else {
      if (maps.parameters.length === 0) {
        warnings.push({ field: 'parameters', message: 'Parameters array is empty' });
      }

      maps.parameters.forEach((item, index) => {
        errors.push(...validateMapItem(item, index, 'parameter'));
      });

      // Check for duplicates
      errors.push(...checkDuplicates(maps.parameters, 'parameter'));
    }
  }

  // Validate optional name
  if (maps.name !== undefined && typeof maps.name !== 'string') {
    errors.push({ field: 'name', message: 'Name must be a string' });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function formatValidationErrors(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push('Errors:');
    result.errors.forEach(err => {
      lines.push(`  - ${err.field}: ${err.message}`);
    });
  }

  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Warnings:');
    result.warnings.forEach(warn => {
      lines.push(`  - ${warn.field}: ${warn.message}`);
    });
  }

  return lines.join('\n');
}
