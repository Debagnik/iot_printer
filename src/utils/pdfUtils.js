const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * PDF Utilities Module
 * Provides helpers for page counting and odd/even page splitting
 */

/**
 * Get the total page count of a PDF file
 * @param {string} pdfPath - Absolute path to the PDF file
 * @returns {Promise<number>} Total number of pages
 */
async function getPageCount(pdfPath) {
    const pdfBytes = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
}

/**
 * Split a PDF into odd-numbered pages and even-numbered pages
 * Odd pages: 1, 3, 5, … (0-indexed: 0, 2, 4, …)
 * Even pages: 2, 4, 6, … (0-indexed: 1, 3, 5, …)
 *
 * @param {string} pdfPath - Absolute path to the source PDF
 * @returns {Promise<{oddPagesPath: string, evenPagesPath: string, totalPages: number}>}
 */
async function splitPdfOddEven(pdfPath) {
    const pdfBytes = await fs.promises.readFile(pdfPath);
    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    // Create two new PDFs
    const oddDoc = await PDFDocument.create();
    const evenDoc = await PDFDocument.create();

    // Collect indices
    const oddIndices = [];
    const evenIndices = [];
    for (let i = 0; i < totalPages; i++) {
        if (i % 2 === 0) {
            // Pages 1, 3, 5 … (0-indexed 0, 2, 4 …)
            oddIndices.push(i);
        } else {
            evenIndices.push(i);
        }
    }

    // Copy pages
    if (oddIndices.length > 0) {
        const oddPages = await oddDoc.copyPages(srcDoc, oddIndices);
        oddPages.forEach(page => oddDoc.addPage(page));
    }

    if (evenIndices.length > 0) {
        const evenPages = await evenDoc.copyPages(srcDoc, evenIndices);
        evenPages.forEach(page => evenDoc.addPage(page));
    }

    // Write to temp files
    const timestamp = Date.now();
    const baseName = path.basename(pdfPath, path.extname(pdfPath));
    const tmpDir = os.tmpdir();

    const oddPagesPath = path.join(tmpDir, `${baseName}_odd_${timestamp}.pdf`);
    const evenPagesPath = path.join(tmpDir, `${baseName}_even_${timestamp}.pdf`);

    await fs.promises.writeFile(oddPagesPath, await oddDoc.save());
    await fs.promises.writeFile(evenPagesPath, await evenDoc.save());

    console.log(`[PDF] Split "${pdfPath}" (${totalPages} pages) → odd: ${oddPagesPath}, even: ${evenPagesPath}`);

    return { oddPagesPath, evenPagesPath, totalPages };
}

module.exports = {
    getPageCount,
    splitPdfOddEven
};
