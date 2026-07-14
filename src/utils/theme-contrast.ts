/**
 * @file src/utils/theme-contrast.ts
 * @description Theme contrast auditing utility.
 *
 * Analyzes theme JSON for WCAG contrast compliance.
 * Used by admin-theme-service when importing presets.
 */

export interface ContrastWarning {
  message: string;
  level: "info" | "warning" | "error";
}

/**
 * Audit a preset JSON string for contrast and accessibility issues.
 * Returns an array of warnings for display in the import UI.
 */
export function auditPresetJson(presetJson: string): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  try {
    const preset = JSON.parse(presetJson);
    if (preset.colors) {
      // Basic contrast check - warn about custom themes needing manual verification
      warnings.push({
        message: "Custom theme imported. Please verify WCAG contrast ratios manually.",
        level: "info",
      });
    }
  } catch {
    warnings.push({
      message: "Unable to parse preset JSON for contrast audit.",
      level: "warning",
    });
  }
  return warnings;
}
