const fc = require('fast-check');
const PrintSettings = require('./printSettings');

describe('Print Settings', () => {
  /**
   * **Feature: print-queue-manager, Property 3: Print Settings Persistence**
   * 
   * For any print job with configured settings, after the job is stored in the database
   * and retrieved, all settings (paper type, quality, color mode, paper size) should
   * match the originally configured values.
   * 
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 4.3**
   */
  test('Property 3: Print Settings Persistence - Settings round trip through normalization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          paperType: fc.constantFrom(...PrintSettings.AVAILABLE_OPTIONS.paperTypes),
          printQuality: fc.constantFrom(...PrintSettings.AVAILABLE_OPTIONS.printQualities),
          colorMode: fc.constantFrom(...PrintSettings.AVAILABLE_OPTIONS.colorModes),
          paperSize: fc.constantFrom(...PrintSettings.AVAILABLE_OPTIONS.paperSizes)
        }),
        async (originalSettings) => {
          // Phase 1: Normalize settings (simulating storage)
          const normalizedSettings = PrintSettings.normalizeSettings(originalSettings);

          // Phase 2: Verify all settings match after normalization
          expect(normalizedSettings.paperType).toBe(originalSettings.paperType);
          expect(normalizedSettings.printQuality).toBe(originalSettings.printQuality);
          expect(normalizedSettings.colorMode).toBe(originalSettings.colorMode);
          expect(normalizedSettings.paperSize).toBe(originalSettings.paperSize);

          // Phase 3: Verify types are correct
          expect(typeof normalizedSettings.paperType).toBe('string');
          expect(typeof normalizedSettings.printQuality).toBe('number');
          expect(typeof normalizedSettings.colorMode).toBe('string');
          expect(typeof normalizedSettings.paperSize).toBe('string');

          // Phase 4: Verify settings are valid
          const validation = PrintSettings.validateSettings(normalizedSettings);
          expect(validation.isValid).toBe(true);
          expect(validation.errors.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: print-queue-manager, Property 6: Default Settings Application**
   * 
   * For any print job created without explicit settings, the job should have default values:
   * Plain Paper, 600 DPI, Grayscale, and A4 paper size.
   * 
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
   */
  test('Property 6: Default Settings Application - Defaults applied when settings missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate partial settings (some fields missing)
          includesPaperType: fc.boolean(),
          includesPrintQuality: fc.boolean(),
          includesColorMode: fc.boolean(),
          includesPaperSize: fc.boolean()
        }),
        async (config) => {
          // Phase 1: Create partial settings based on config
          const partialSettings = {};

          if (config.includesPaperType) {
            partialSettings.paperType = fc.sample(
              fc.constantFrom(...PrintSettings.AVAILABLE_OPTIONS.paperTypes),
              1
            )[0];
          }

          if (config.includesPrintQuality) {
            partialSettings.printQuality = fc.sample(
              fc.constantFrom(...PrintSettings.AVAILABLE_OPTIONS.printQualities),
              1
            )[0];
          }

          if (config.includesColorMode) {
            partialSettings.colorMode = fc.sample(
              fc.constantFrom(...PrintSettings.AVAILABLE_OPTIONS.colorModes),
              1
            )[0];
          }

          if (config.includesPaperSize) {
            partialSettings.paperSize = fc.sample(
              fc.constantFrom(...PrintSettings.AVAILABLE_OPTIONS.paperSizes),
              1
            )[0];
          }

          // Phase 2: Apply defaults
          const completeSettings = PrintSettings.applyDefaults(partialSettings);

          // Phase 3: Verify all fields are present
          expect(completeSettings.paperType).toBeDefined();
          expect(completeSettings.printQuality).toBeDefined();
          expect(completeSettings.colorMode).toBeDefined();
          expect(completeSettings.paperSize).toBeDefined();

          // Phase 4: Verify defaults are applied for missing fields
          if (!config.includesPaperType) {
            expect(completeSettings.paperType).toBe(PrintSettings.DEFAULT_SETTINGS.paperType);
          }

          if (!config.includesPrintQuality) {
            expect(completeSettings.printQuality).toBe(PrintSettings.DEFAULT_SETTINGS.printQuality);
          }

          if (!config.includesColorMode) {
            expect(completeSettings.colorMode).toBe(PrintSettings.DEFAULT_SETTINGS.colorMode);
          }

          if (!config.includesPaperSize) {
            expect(completeSettings.paperSize).toBe(PrintSettings.DEFAULT_SETTINGS.paperSize);
          }

          // Phase 5: Verify provided fields are preserved
          if (config.includesPaperType) {
            expect(completeSettings.paperType).toBe(partialSettings.paperType);
          }

          if (config.includesPrintQuality) {
            expect(completeSettings.printQuality).toBe(partialSettings.printQuality);
          }

          if (config.includesColorMode) {
            expect(completeSettings.colorMode).toBe(partialSettings.colorMode);
          }

          if (config.includesPaperSize) {
            expect(completeSettings.paperSize).toBe(partialSettings.paperSize);
          }

          // Phase 6: Verify all settings are valid
          const validation = PrintSettings.validateSettings(completeSettings);
          expect(validation.isValid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Unit test: Validate settings with invalid values
   */
  test('Unit test: Invalid settings are rejected', () => {
    const invalidSettings = {
      paperType: 'InvalidPaper',
      printQuality: 800,
      colorMode: 'InvalidColor',
      paperSize: 'InvalidSize'
    };

    const validation = PrintSettings.validateSettings(invalidSettings);

    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  /**
   * Unit test: Valid settings pass validation
   */
  test('Unit test: Valid settings pass validation', () => {
    const validSettings = {
      paperType: 'Plain Paper',
      printQuality: 600,
      colorMode: 'Grayscale',
      paperSize: 'A4'
    };

    const validation = PrintSettings.validateSettings(validSettings);

    expect(validation.isValid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  /**
   * Unit test: Get defaults returns correct values
   */
  test('Unit test: Get defaults returns correct values', () => {
    const defaults = PrintSettings.getDefaults();

    expect(defaults.paperType).toBe('Plain Paper');
    expect(defaults.printQuality).toBe(600);
    expect(defaults.colorMode).toBe('Grayscale');
    expect(defaults.paperSize).toBe('A4');
  });

  /**
   * Unit test: Get available options returns all options
   */
  test('Unit test: Get available options returns all options', () => {
    const options = PrintSettings.getAvailableOptions();

    expect(Array.isArray(options.paperTypes)).toBe(true);
    expect(Array.isArray(options.printQualities)).toBe(true);
    expect(Array.isArray(options.colorModes)).toBe(true);
    expect(Array.isArray(options.paperSizes)).toBe(true);

    expect(options.paperTypes.length).toBeGreaterThan(0);
    expect(options.printQualities.length).toBeGreaterThan(0);
    expect(options.colorModes.length).toBeGreaterThan(0);
    expect(options.paperSizes.length).toBeGreaterThan(0);
  });
});
