const fc = require('fast-check');
const printerIntegration = require('./printerIntegration');
const fs = require('fs');
const path = require('path');

describe('Printer Integration Module', () => {
  /**
   * **Feature: print-queue-manager, Property 2: File Format Validation**
   * 
   * For any uploaded file, if the file extension is not in the supported formats list
   * (PDF, JPG, PNG, GIF, BMP, TIFF), the upload should be rejected and the file should
   * not be stored.
   * 
   * **Validates: Requirements 2.3, 2.5**
   */
  describe('formatPrinterOptions', () => {
    test('should format valid print settings correctly', () => {
      const settings = {
        paperType: 'Plain Paper',
        printQuality: 'Normal',
        colorMode: 'Grayscale',
        paperSize: 'A4'
      };

      const options = printerIntegration.formatPrinterOptions(settings);

      expect(options).toContain('-o media=A4');
      expect(options).toContain('-o ColorModel=KGray');
      expect(options).toContain('-o OutputMode=Normal');
      expect(options).toContain('-o MediaType=Plain');
    });

    test('should handle color mode correctly', () => {
      const colorSettings = {
        colorMode: 'Color',
        paperType: 'Plain Paper',
        printQuality: 600,
        paperSize: 'A4'
      };

      const options = printerIntegration.formatPrinterOptions(colorSettings);
      expect(options).toContain('-o ColorModel=RGB');
    });

    test('should handle different paper sizes', () => {
      const sizes = ['A4', 'Letter', 'Legal'];

      sizes.forEach(size => {
        const settings = {
          paperSize: size,
          paperType: 'Plain Paper',
          printQuality: 600,
          colorMode: 'Grayscale'
        };

        const options = printerIntegration.formatPrinterOptions(settings);
        expect(options).toContain(`-o media=${size}`);
      });
    });

    test('should handle photo quality settings', () => {
      const settings = {
        paperType: 'Plain Paper',
        printQuality: 'Photo',
        colorMode: 'Grayscale',
        paperSize: 'A4'
      };

      const options = printerIntegration.formatPrinterOptions(settings);
      expect(options).toContain('-o OutputMode=Photo');
    });

    test('should handle glossy paper type', () => {
      const settings = {
        paperType: 'Glossy',
        printQuality: 600,
        colorMode: 'Grayscale',
        paperSize: 'A4'
      };

      const options = printerIntegration.formatPrinterOptions(settings);
      expect(options).toContain('-o MediaType=Glossy');
    });

    test('Property: Format options with various valid settings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            paperType: fc.constantFrom('Plain Paper', 'Glossy'),
            printQuality: fc.constantFrom('Normal', 'Best', 'Photo'),
            colorMode: fc.constantFrom('Color', 'Grayscale'),
            paperSize: fc.constantFrom('A4', 'Letter', 'Legal')
          }),
          async (settings) => {
            const options = printerIntegration.formatPrinterOptions(settings);

            // Verify options is a string
            expect(typeof options).toBe('string');

            // Verify all settings are represented in options
            expect(options).toContain('-o media=');
            expect(options).toContain('-o ColorModel=');
            expect(options).toContain('-o OutputMode=');
            expect(options).toContain('-o MediaType=');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validatePrintSettings', () => {
    test('should validate correct settings', () => {
      const settings = {
        paperType: 'Plain Paper',
        printQuality: 600,
        colorMode: 'Grayscale',
        paperSize: 'A4'
      };

      const result = printerIntegration.validatePrintSettings(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid paper type', () => {
      const settings = {
        paperType: 'Invalid Paper',
        printQuality: 600,
        colorMode: 'Grayscale',
        paperSize: 'A4'
      };

      const result = printerIntegration.validatePrintSettings(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject invalid print quality', () => {
      const settings = {
        paperType: 'Plain Paper',
        printQuality: 'Ultra',
        colorMode: 'Grayscale',
        paperSize: 'A4'
      };

      const result = printerIntegration.validatePrintSettings(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject invalid color mode', () => {
      const settings = {
        paperType: 'Plain Paper',
        printQuality: 600,
        colorMode: 'Sepia',
        paperSize: 'A4'
      };

      const result = printerIntegration.validatePrintSettings(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject invalid paper size', () => {
      const settings = {
        paperType: 'Plain Paper',
        printQuality: 600,
        colorMode: 'Grayscale',
        paperSize: 'A3'
      };

      const result = printerIntegration.validatePrintSettings(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject null settings', () => {
      const result = printerIntegration.validatePrintSettings(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('Property: Validate all valid setting combinations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            paperType: fc.constantFrom('Plain Paper', 'Glossy'),
            printQuality: fc.constantFrom('Normal', 'Best', 'Photo'),
            colorMode: fc.constantFrom('Color', 'Grayscale'),
            paperSize: fc.constantFrom('A4', 'Letter', 'Legal')
          }),
          async (settings) => {
            const result = printerIntegration.validatePrintSettings(settings);

            // All valid combinations should pass validation
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getPrinterStatus', () => {
    test('should return status object with required fields', async () => {
      const status = await printerIntegration.getPrinterStatus();

      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('message');
      expect(typeof status.available).toBe('boolean');
      expect(typeof status.status).toBe('string');
      expect(typeof status.message).toBe('string');
    });

    test('should handle printer not available gracefully', async () => {
      const status = await printerIntegration.getPrinterStatus();

      // Should return a valid response even if printer is not available
      expect(status.available).toBeDefined();
      expect(status.status).toBeDefined();
      expect(status.message).toBeDefined();
    });
  });

  describe('getPrintQueueStatus', () => {
    test('should return queue status object', async () => {
      const queueStatus = await printerIntegration.getPrintQueueStatus();

      expect(queueStatus).toHaveProperty('jobs');
      expect(queueStatus).toHaveProperty('message');
      expect(Array.isArray(queueStatus.jobs)).toBe(true);
      expect(typeof queueStatus.message).toBe('string');
    });
  });

  describe('cancelPrintJob', () => {
    test('should reject empty job ID', async () => {
      const result = await printerIntegration.cancelPrintJob('');

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    test('should reject null job ID', async () => {
      const result = await printerIntegration.cancelPrintJob(null);

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    test('should return result object with required fields', async () => {
      const result = await printerIntegration.cancelPrintJob('123');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });
  });

  describe('getPrinterCapabilities', () => {
    test('should return capabilities object', async () => {
      const capabilities = await printerIntegration.getPrinterCapabilities();

      expect(capabilities).toHaveProperty('capabilities');
      expect(capabilities).toHaveProperty('message');
      expect(capabilities.capabilities).toHaveProperty('paperTypes');
      expect(capabilities.capabilities).toHaveProperty('printQualities');
      expect(capabilities.capabilities).toHaveProperty('colorModes');
      expect(capabilities.capabilities).toHaveProperty('paperSizes');
    });

    test('should return valid capability arrays', async () => {
      const capabilities = await printerIntegration.getPrinterCapabilities();

      expect(Array.isArray(capabilities.capabilities.paperTypes)).toBe(true);
      expect(Array.isArray(capabilities.capabilities.printQualities)).toBe(true);
      expect(Array.isArray(capabilities.capabilities.colorModes)).toBe(true);
      expect(Array.isArray(capabilities.capabilities.paperSizes)).toBe(true);
    });
  });

  describe('submitJobToPrinter', () => {
    test('should reject non-existent document', async () => {
      const settings = {
        paperType: 'Plain Paper',
        printQuality: 600,
        colorMode: 'Grayscale',
        paperSize: 'A4'
      };

      const result = await printerIntegration.submitJobToPrinter('/nonexistent/file.pdf', settings);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    test('should reject invalid settings', async () => {
      // Create a temporary test file
      const testFile = path.join(__dirname, '../../data/test_document.pdf');
      if (!fs.existsSync(testFile)) {
        fs.writeFileSync(testFile, 'Test PDF content');
      }

      try {
        const result = await printerIntegration.submitJobToPrinter(testFile, null);

        expect(result.success).toBe(false);
        expect(result.message).toBeDefined();
      } finally {
        if (fs.existsSync(testFile)) {
          try {
            fs.unlinkSync(testFile);
          } catch (err) {
            // Ignore cleanup errors
          }
        }
      }
    });

    test('should return result object with required fields', async () => {
      // Create a temporary test file
      const testFile = path.join(__dirname, '../../data/test_document.pdf');
      if (!fs.existsSync(testFile)) {
        fs.writeFileSync(testFile, 'Test PDF content');
      }

      try {
        const settings = {
          paperType: 'Plain Paper',
          printQuality: 600,
          colorMode: 'Grayscale',
          paperSize: 'A4'
        };

        const result = await printerIntegration.submitJobToPrinter(testFile, settings);

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('jobId');
        expect(result).toHaveProperty('message');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.message).toBe('string');
      } finally {
        if (fs.existsSync(testFile)) {
          try {
            fs.unlinkSync(testFile);
          } catch (err) {
            // Ignore cleanup errors
          }
        }
      }
    });
  });
});
