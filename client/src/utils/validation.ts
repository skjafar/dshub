/**
 * Validation utilities for DeviceMon
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate a register/parameter value
 */
export function validateValue(value: string | number, type: string = 'uint32_t'): ValidationResult {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  // Check if it's a valid number
  if (isNaN(numValue)) {
    return { isValid: false, error: 'Value must be a valid number' };
  }

  // Type-specific validation
  switch (type) {
    case 'uint32_t':
      if (numValue < 0) {
        return { isValid: false, error: 'Value must be non-negative for unsigned integer' };
      }
      if (numValue > 4294967295) {
        return { isValid: false, error: 'Value exceeds maximum for uint32_t (4,294,967,295)' };
      }
      if (!Number.isInteger(numValue)) {
        return { isValid: false, error: 'Value must be an integer for uint32_t' };
      }
      break;

    case 'int':
    case 'int32_t':
      if (numValue < -2147483648 || numValue > 2147483647) {
        return { isValid: false, error: 'Value out of range for int32_t (-2,147,483,648 to 2,147,483,647)' };
      }
      if (!Number.isInteger(numValue)) {
        return { isValid: false, error: 'Value must be an integer for int32_t' };
      }
      break;

    case 'float':
      // JavaScript numbers are always floats, just check for valid range
      if (!isFinite(numValue)) {
        return { isValid: false, error: 'Value must be a finite number' };
      }
      break;

    case 'hex':
      if (numValue < 0 || numValue > 0xFFFFFFFF) {
        return { isValid: false, error: 'Hex value out of range (0x00000000 to 0xFFFFFFFF)' };
      }
      if (!Number.isInteger(numValue)) {
        return { isValid: false, error: 'Hex value must be an integer' };
      }
      break;

    default:
      // Unknown type, perform basic validation
      if (!isFinite(numValue)) {
        return { isValid: false, error: 'Value must be a finite number' };
      }
  }

  return { isValid: true };
}

/**
 * Validate IP address format
 */
export function validateIPAddress(ip: string): ValidationResult {
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipRegex);

  if (!match) {
    return { isValid: false, error: 'Invalid IP address format (expected: xxx.xxx.xxx.xxx)' };
  }

  const octets = match.slice(1, 5).map(Number);
  for (const octet of octets) {
    if (octet < 0 || octet > 255) {
      return { isValid: false, error: 'IP address octets must be between 0 and 255' };
    }
  }

  return { isValid: true };
}

/**
 * Validate port number
 */
export function validatePort(port: number): ValidationResult {
  if (!Number.isInteger(port)) {
    return { isValid: false, error: 'Port must be an integer' };
  }

  if (port < 1 || port > 65535) {
    return { isValid: false, error: 'Port must be between 1 and 65535' };
  }

  return { isValid: true };
}

/**
 * Validate poll interval for plotting
 */
export function validatePollInterval(interval: number): ValidationResult {
  if (!Number.isInteger(interval)) {
    return { isValid: false, error: 'Poll interval must be an integer' };
  }

  if (interval < 10) {
    return { isValid: false, error: 'Poll interval must be at least 10ms' };
  }

  if (interval > 60000) {
    return { isValid: false, error: 'Poll interval cannot exceed 60000ms (1 minute)' };
  }

  return { isValid: true };
}

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>'"]/g, '');
}

/**
 * Format number for display based on type
 */
export function formatValueForDisplay(value: number, type: string = 'uint32_t'): string {
  switch (type) {
    case 'hex':
      return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
    case 'float':
      return value.toFixed(3);
    default:
      return value.toString();
  }
}
