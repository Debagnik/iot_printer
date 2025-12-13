const fc = require('fast-check');
const fileValidator = require('./fileValidator');

describe('File Validator', () => {
  describe('validateFileFormat', () => {
    /**
     * Feature: print-queue-manager, Property 2: File Format Validation
     * For any uploaded file, if the file extension is not in the supported formats list 
     * (PDF, JPG, PNG, GIF, BMP, TIFF), the upload should be rejected and the file should not be stored.
     * Validates: Requirements 2.3, 2.5
     */
    test('Property 2: File Format Validation - supported formats are accepted', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant({ filename: 'document.pdf', mimetype: 'application/pdf' }),
            fc.constant({ filename: 'image.jpg', mimetype: 'image/jpeg' }),
            fc.constant({ filename: 'image.jpeg', mimetype: 'image/jpeg' }),
            fc.constant({ filename: 'image.png', mimetype: 'image/png' }),
            fc.constant({ filename: 'image.gif', mimetype: 'image/gif' }),
            fc.constant({ filename: 'image.bmp', mimetype: 'image/bmp' }),
            fc.constant({ filename: 'image.tiff', mimetype: 'image/tiff' }),
            fc.constant({ filename: 'image.tif', mimetype: 'image/tiff' })
          ),
          ({ filename, mimetype }) => {
            const result = fileValidator.validateFileFormat(filename, mimetype);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: print-queue-manager, Property 2: File Format Validation
     * For any uploaded file, if the file extension is not in the supported formats list 
     * (PDF, JPG, PNG, GIF, BMP, TIFF), the upload should be rejected and the file should not be stored.
     * Validates: Requirements 2.3, 2.5
     */
    test('Property 2: File Format Validation - unsupported formats are rejected', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z0-9]+$/),
            fc.oneof(
              fc.constant('application/msword'),
              fc.constant('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
              fc.constant('text/plain'),
              fc.constant('application/x-executable'),
              fc.constant('video/mp4'),
              fc.constant('audio/mpeg')
            )
          ),
          ([filename, mimetype]) => {
            // Generate unsupported extension
            const unsupportedExt = '.doc';
            const testFilename = `${filename}${unsupportedExt}`;
            
            const result = fileValidator.validateFileFormat(testFilename, mimetype);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: print-queue-manager, Property 2: File Format Validation
     * For any uploaded file, if the file extension is not in the supported formats list 
     * (PDF, JPG, PNG, GIF, BMP, TIFF), the upload should be rejected and the file should not be stored.
     * Validates: Requirements 2.3, 2.5
     */
    test('Property 2: File Format Validation - mismatched extension and MIME type are rejected', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z0-9]+$/),
            fc.oneof(
              fc.constant({ filename: 'file.pdf', mimetype: 'image/jpeg' }),
              fc.constant({ filename: 'file.jpg', mimetype: 'application/pdf' }),
              fc.constant({ filename: 'file.png', mimetype: 'image/gif' }),
              fc.constant({ filename: 'file.gif', mimetype: 'image/bmp' })
            )
          ),
          ([, { filename, mimetype }]) => {
            const result = fileValidator.validateFileFormat(filename, mimetype);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateFileSize', () => {
    /**
     * Feature: print-queue-manager, Property 5: File Size Validation
     * For any file, if the file size is within the acceptable limits (0 < size <= limit),
     * the file should be accepted. If the file size exceeds the limit or is zero/negative,
     * the file should be rejected.
     * Validates: Requirements 2.5
     */
    test('Property 5: File Size Validation - files within limit are accepted', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: fileValidator.DEFAULT_FILE_SIZE_LIMIT }),
          (fileSize) => {
            const result = fileValidator.validateFileSize(fileSize);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: print-queue-manager, Property 5: File Size Validation
     * For any file, if the file size is within the acceptable limits (0 < size <= limit),
     * the file should be accepted. If the file size exceeds the limit or is zero/negative,
     * the file should be rejected.
     * Validates: Requirements 2.5
     */
    test('Property 5: File Size Validation - files exceeding limit are rejected', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: fileValidator.DEFAULT_FILE_SIZE_LIMIT + 1, max: fileValidator.DEFAULT_FILE_SIZE_LIMIT + 1000000 }),
          (fileSize) => {
            const result = fileValidator.validateFileSize(fileSize);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: print-queue-manager, Property 5: File Size Validation
     * For any file, if the file size is within the acceptable limits (0 < size <= limit),
     * the file should be accepted. If the file size exceeds the limit or is zero/negative,
     * the file should be rejected.
     * Validates: Requirements 2.5
     */
    test('Property 5: File Size Validation - zero and negative sizes are rejected', () => {
      fc.assert(
        fc.property(
          fc.integer({ max: 0 }),
          (fileSize) => {
            const result = fileValidator.validateFileSize(fileSize);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: print-queue-manager, Property 5: File Size Validation
     * For any file, if the file size is within the acceptable limits (0 < size <= limit),
     * the file should be accepted. If the file size exceeds the limit or is zero/negative,
     * the file should be rejected.
     * Validates: Requirements 2.5
     */
    test('Property 5: File Size Validation - custom size limits are respected', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 1000, max: 10000000 }),
            fc.integer({ min: 2, max: 100 })
          ),
          ([customLimit, multiplier]) => {
            const fileSize = customLimit * multiplier;
            const result = fileValidator.validateFileSize(fileSize, customLimit);
            
            // Should be rejected because fileSize > customLimit (multiplier >= 2)
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Helper functions', () => {
    test('getSupportedMimeTypes returns array of MIME types', () => {
      const mimeTypes = fileValidator.getSupportedMimeTypes();
      expect(Array.isArray(mimeTypes)).toBe(true);
      expect(mimeTypes.length).toBeGreaterThan(0);
      expect(mimeTypes).toContain('application/pdf');
      expect(mimeTypes).toContain('image/jpeg');
      expect(mimeTypes).toContain('image/png');
    });

    test('getSupportedExtensions returns array of extensions', () => {
      const extensions = fileValidator.getSupportedExtensions();
      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions.length).toBeGreaterThan(0);
      expect(extensions).toContain('.pdf');
      expect(extensions).toContain('.jpg');
      expect(extensions).toContain('.png');
    });

    test('getFileExtension extracts extension correctly', () => {
      expect(fileValidator.getFileExtension('document.pdf')).toBe('.pdf');
      expect(fileValidator.getFileExtension('image.jpg')).toBe('.jpg');
      expect(fileValidator.getFileExtension('file.with.dots.png')).toBe('.png');
      expect(fileValidator.getFileExtension('noextension')).toBe('');
    });

    test('getFileSizeLimitMB converts bytes to MB', () => {
      const limitMB = fileValidator.getFileSizeLimitMB();
      expect(limitMB).toBe(50);
      
      const customLimitMB = fileValidator.getFileSizeLimitMB(100 * 1024 * 1024);
      expect(customLimitMB).toBe(100);
    });
  });
});
