import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import { PDFExtract, PDFExtractOptions } from 'pdf.js-extract';
import { generatePdf } from 'html-pdf-node';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createWorker } from 'tesseract.js';
import { createCanvas, loadImage } from 'canvas';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for larger PDFs with images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(join(__dirname, '../..', 'public')));

// Initialize PDF extractor
const pdfExtract = new PDFExtract();
const extractOptions = {
  normalizeWhitespace: true,
  disableCombineTextItems: false
};

// Initialize Tesseract worker for server-side OCR
let tesseractWorker: any = null;

// Initialize Tesseract worker
const initTesseract = async () => {
  try {
    if (!tesseractWorker) {
      // Create worker with proper initialization
      tesseractWorker = await createWorker();
      
      // Initialize with English language
      await tesseractWorker.initialize('eng');
      await tesseractWorker.setParameters({
        tessedit_ocr_engine_mode: 1, // Use LSTM OCR Engine
      });
      console.log('Tesseract worker initialized');
    }
  } catch (error) {
    console.error('Failed to initialize Tesseract worker:', error);
    // Don't throw the error, just log it and continue
  }
};

// Initialize OCR worker on server start
initTesseract().catch(err => {
  console.error('Failed to initialize Tesseract worker:', err);
});

// Process image with OCR
const processImageWithOCR = async (imageBuffer: Buffer): Promise<string> => {
  if (!tesseractWorker) {
    console.warn('Tesseract worker not initialized, attempting to initialize now');
    try {
      await initTesseract();
    } catch (initError) {
      console.error('Failed to initialize Tesseract worker on demand:', initError);
      return '';
    }
    
    // If still not initialized, return empty string
    if (!tesseractWorker) {
      console.warn('Tesseract worker still not initialized after attempt');
      return '';
    }
  }

  try {
    // Use recognize directly with the buffer
    const { data: { text } } = await tesseractWorker.recognize(imageBuffer);
    return text || '';
  } catch (error) {
    console.error('OCR processing error:', error);
    return '';
  }
};

// Extract images from PDF page
const extractImagesFromPage = async (pdfPath: string, pageNum: number): Promise<Buffer[]> => {
  try {
    const images: Buffer[] = [];
    
    // For demonstration purposes, we'll create a canvas with the page content
    const pdfData = await pdfExtract.extract(pdfPath, extractOptions);
    if (pdfData.pages.length >= pageNum) {
      const page = pdfData.pages[pageNum - 1];
      
      // Create a canvas with the page dimensions
      // Default to A4 dimensions if not available
      const pageWidth = 595; // Default A4 width
      const pageHeight = 842; // Default A4 height
      const canvas = createCanvas(pageWidth, pageHeight);
      const ctx = canvas.getContext('2d');
      
      // Fill with white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, pageWidth, pageHeight);
      
      // Draw text content
      ctx.fillStyle = 'black';
      ctx.font = '12px Arial';
      
      page.content.forEach(item => {
        ctx.fillText(item.str, item.x, item.y);
      });
      
      // Convert canvas to buffer
      const buffer = canvas.toBuffer('image/png');
      images.push(buffer);
    }
    
    return images;
  } catch (error) {
    console.error('Error extracting images from PDF:', error);
    return [];
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

interface PDFPage {
  content: string;
  width: number;
  height: number;
  images?: Array<{
    data: string;
    width: number;
    height: number;
    x: number;
    y: number;
  }>;
}

// Error handling middleware
const errorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// Add the upload endpoint
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pdfPath = req.file.path;
    console.log(`Processing PDF: ${pdfPath}`);

    // Extract PDF content
    const data = await pdfExtract.extract(pdfPath, extractOptions);
    
    // Process each page with OCR
    const processedPages = await Promise.all(data.pages.map(async (page, index) => {
      // Extract images from the page
      const images = await extractImagesFromPage(pdfPath, index + 1);
      
      // Process each image with OCR
      const ocrResults = await Promise.all(images.map(async (imageBuffer) => {
        return await processImageWithOCR(imageBuffer);
      }));
      
      // Combine OCR results with text content
      const textContent = page.content.map(item => item.str).join(' ');
      const ocrContent = ocrResults.join('\n\n');
      
      // Create enhanced text that combines both
      const enhancedText = `
        <div class="extracted-text">
          <div class="pdf-text">${textContent}</div>
          ${ocrContent ? `<div class="ocr-text">${ocrContent}</div>` : ''}
        </div>
      `;

      return {
        pageNumber: index + 1,
        width: 595, // Default A4 width
        height: 842, // Default A4 height
        textContent,
        ocrContent,
        enhancedText
      };
    }));

    // Clean up the uploaded file
    fs.unlink(pdfPath, (err) => {
      if (err) console.error(`Error deleting temporary file: ${err}`);
    });

    // Return the processed data
    res.json({
      success: true,
      pages: processedPages,
      pageCount: data.pages.length
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

app.post('/api/export', async (req, res, next) => {
  try {
    const { htmlContent } = req.body;
    
    if (!htmlContent) {
      return res.status(400).json({ error: 'No HTML content provided' });
    }

    // Improved PDF generation options
    const options = {
      format: 'A4',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
      displayHeaderFooter: false,
      timeout: 60000 // 60 seconds timeout for larger documents
    };
    
    // Add CSS to ensure images are properly handled
    const enhancedHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
          }
          img {
            max-width: 100%;
            height: auto;
            display: block;
            object-fit: contain;
          }
          img[src^="data:image"] {
            image-rendering: high-quality;
          }
          .pdf-page {
            page-break-after: always;
            position: relative;
            width: 100%;
            box-sizing: border-box;
          }
          .pdf-page:last-child {
            page-break-after: auto;
          }
          /* Fix for broken images */
          img::before {
            content: '';
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: #f0f0f0;
          }
          img::after {
            content: '⚠️ Image failed to load';
            display: block;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 14px;
            color: #666;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    
    const file = { content: enhancedHtml };
    
    try {
    const pdfBuffer = await generatePdf(file, options);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=exported.pdf');
    res.send(pdfBuffer);
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
      
      // Try with more conservative settings if the first attempt fails
      try {
        const fallbackOptions = {
          ...options,
          scale: 0.8, // Reduce scale
          timeout: 120000, // Longer timeout
        };
        
        console.log('Retrying PDF generation with fallback options');
        const pdfBuffer = await generatePdf(file, fallbackOptions);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=exported.pdf');
        res.send(pdfBuffer);
      } catch (fallbackError) {
        // Fix the TypeScript error by properly typing the error
        const errorMessage = fallbackError instanceof Error 
          ? fallbackError.message 
          : 'Unknown error during PDF generation';
        throw new Error(`Failed to generate PDF: ${errorMessage}`);
      }
    }
  } catch (error) {
    next(error);
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Apply error handling middleware
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 