import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../styles/PDFEditor.css';
import { createWorker } from 'tesseract.js';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

// TinyMCE API Key
const TINYMCE_API_KEY = 'f1tx56c31hjm3x5zrk6i9jc89s20ha67t6wgqes00tc004tj';

// Initialize Tesseract worker for OCR
let tesseractWorker: any = null;

interface PDFPage {
  content: string;
  editedContent?: string;
  width: number;
  height: number;
  scale: number;
  images: Array<{
    dataUrl: string;
    width: number;
    height: number;
    x: number;
    y: number;
  }>;
}

const PDFEditor: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pages, setPages] = useState<PDFPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const editorRef = useRef<any>(null);
  const [editedContents, setEditedContents] = useState<{ [key: number]: string }>({});
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  // Initialize Tesseract worker
  useEffect(() => {
    const initTesseract = async () => {
      if (!tesseractWorker) {
        try {
          // Create worker without any options to avoid DataCloneError
          tesseractWorker = await createWorker();
          
          // Set up progress tracking after worker creation
          if (tesseractWorker.setProgressHandler) {
            tesseractWorker.setProgressHandler((m: any) => {
              if (m.status === 'recognizing text') {
                setOcrProgress(parseInt((m.progress * 100).toString(), 10));
              }
            });
          } else {
            // Fallback for older versions or different implementations
            console.log('Progress handler not available on this Tesseract worker');
          }
          
          await tesseractWorker.loadLanguage('eng');
          await tesseractWorker.initialize('eng');
          console.log('Tesseract worker initialized in client');
        } catch (error) {
          console.error('Failed to initialize Tesseract worker in client:', error);
        }
      }
    };

    initTesseract();

    // Cleanup worker on component unmount
    return () => {
      if (tesseractWorker) {
        tesseractWorker.terminate();
        tesseractWorker = null;
      }
    };
  }, []);

  const extractImages = async (page: pdfjsLib.PDFPageProxy, viewport: pdfjsLib.PageViewport) => {
    const operatorList = await page.getOperatorList();
    const images: Array<{dataUrl: string; width: number; height: number; x: number; y: number}> = [];
    
    try {
      // Create a delay function to wait for objects to be resolved
      const waitForObject = async (ref: string) => {
        let attempts = 0;
        const maxAttempts = 50; // Increased attempts further
        const delay = 150; // Increased delay for better reliability

        while (attempts < maxAttempts) {
          const obj = page.objs.get(ref);
          if (obj) {
            return obj;
          }
          await new Promise(resolve => setTimeout(resolve, delay));
          attempts++;
        }
        throw new Error(`Failed to resolve object ${ref} after ${maxAttempts} attempts`);
      };

      // Track processed image refs to avoid duplicates
      const processedRefs = new Set<string>();

      // Create an image cache to avoid reprocessing the same images
      const imageCache = new Map<string, string>();

      // First pass: collect all image references
      const imageRefs: string[] = [];
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        if (operatorList.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
          const imageRef = operatorList.argsArray[i][0];
          if (!processedRefs.has(imageRef)) {
            imageRefs.push(imageRef);
          processedRefs.add(imageRef);
          }
        }
      }

      // Process all images with a longer timeout
      await Promise.all(imageRefs.map(async (imageRef) => {
        try {
          // Check if image is in cache
          if (imageCache.has(imageRef)) {
            const cachedImage = imageCache.get(imageRef)!;
            const img = new Image();
            
            // Create a promise to wait for image loading
            await new Promise<void>((resolve, reject) => {
              img.onload = () => {
                // Find the operator that uses this image
                let x = 0;
                let y = 0;
                let foundOperator = false;
                
                for (let i = 0; i < operatorList.fnArray.length; i++) {
                  if (operatorList.fnArray[i] === pdfjsLib.OPS.paintImageXObject && 
                      operatorList.argsArray[i][0] === imageRef) {
                    foundOperator = true;
                    // Try to get position from transform matrix if available
                    if (operatorList.argsArray[i].length > 1) {
                      x = operatorList.argsArray[i][1] * viewport.scale;
                      y = viewport.height - (operatorList.argsArray[i][2] * viewport.scale) - (img.height * viewport.scale);
                    }
                    break;
                  }
                }
                
                if (foundOperator) {
                  // Calculate scaled dimensions
                  const scaledWidth = img.width * viewport.scale;
                  const scaledHeight = img.height * viewport.scale;
                  
                  images.push({
                    dataUrl: cachedImage,
                    width: scaledWidth,
                    height: scaledHeight,
                    x,
                    y
                  });
                }
                
                resolve();
              };
              
              img.onerror = () => {
                console.warn(`Failed to load cached image ${imageRef}`);
                reject();
              };
              
              img.src = cachedImage;
            }).catch(() => {
              // If cached image fails, remove from cache
              imageCache.delete(imageRef);
            });
            
            // If image was successfully loaded from cache, continue to next image
            if (imageCache.has(imageRef)) return;
          }
          
            const imgData = await waitForObject(imageRef);

            if (imgData && (imgData as any).data) {
              const imageCanvas = document.createElement('canvas');
            const imageCtx = imageCanvas.getContext('2d', { willReadFrequently: true })!;
              
              // Set canvas dimensions to image dimensions
              imageCanvas.width = (imgData as any).width;
              imageCanvas.height = (imgData as any).height;
              
              // Create ImageData and draw to canvas
              const imgArray = new Uint8ClampedArray((imgData as any).data);
              const imgData2 = new ImageData(imgArray, (imgData as any).width, (imgData as any).height);
              imageCtx.putImageData(imgData2, 0, 0);

            // Find the operator that uses this image
            let x = 0;
            let y = 0;
            let foundOperator = false;
            
            for (let i = 0; i < operatorList.fnArray.length; i++) {
              if (operatorList.fnArray[i] === pdfjsLib.OPS.paintImageXObject && 
                  operatorList.argsArray[i][0] === imageRef) {
                foundOperator = true;
                // Try to get position from transform matrix if available
                if (operatorList.argsArray[i].length > 1) {
                  x = operatorList.argsArray[i][1] * viewport.scale;
                  y = viewport.height - (operatorList.argsArray[i][2] * viewport.scale) - ((imgData as any).height * viewport.scale);
                }
                break;
              }
            }
            
            if (!foundOperator) return;

            // Calculate scaled dimensions
              const scaledWidth = (imgData as any).width * viewport.scale;
              const scaledHeight = (imgData as any).height * viewport.scale;

            // Determine best format based on image characteristics
            // Use PNG for images with transparency or small images, JPEG for photos
            let imageFormat = 'image/png';
            let imageQuality = 1.0;
            
            // Heuristic: If image is large and has many colors, it's likely a photo
            if ((imgData as any).width * (imgData as any).height > 10000) {
              // Check for transparency
              const data = imgArray;
              let hasTransparency = false;
              
              // Sample the alpha channel (every 4th byte)
              for (let i = 3; i < data.length; i += 4) {
                if (data[i] < 255) {
                  hasTransparency = true;
                  break;
                }
              }
              
              if (!hasTransparency) {
                imageFormat = 'image/jpeg';
                imageQuality = 0.95; // Higher quality JPEG
              }
            }

            // Convert to appropriate format
            const dataUrl = imageCanvas.toDataURL(imageFormat, imageQuality);
            
            // Cache the image
            imageCache.set(imageRef, dataUrl);
              
              images.push({
                dataUrl,
                width: scaledWidth,
                height: scaledHeight,
                x,
                y
              });
            }
          } catch (error) {
            console.warn(`Failed to extract image ${imageRef}:`, error);
          }
      }));
    } catch (error) {
      console.warn('Failed to extract images:', error);
    }
    
    console.log(`Extracted ${images.length} images from PDF`);
    return images;
  };

  // Add OCR processing function
  const processImageWithOCR = async (imageDataUrl: string) => {
    if (!tesseractWorker) {
      console.warn('Tesseract worker not initialized in client');
      return '';
    }

    try {
      setIsOcrProcessing(true);
      // Use a timeout to prevent hanging
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('OCR processing timeout')), 30000);
      });
      
      // Race the OCR processing against the timeout
      const result = await Promise.race([
        tesseractWorker.recognize(imageDataUrl).then((res: any) => res.data.text),
        timeoutPromise
      ]);
      
      return result;
    } catch (error) {
      console.error('OCR processing error:', error);
      return '';
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number): Promise<PDFPage | null> => {
    try {
      if (!pdf || pageNumber < 1 || pageNumber > pdf.numPages) {
        throw new Error(`Invalid page number: ${pageNumber}`);
      }

      const page = await pdf.getPage(pageNumber);
      if (!page) {
        throw new Error(`Failed to get page ${pageNumber}`);
      }

      const originalViewport = page.getViewport({ scale: 1 });
      if (!originalViewport || !originalViewport.width || !originalViewport.height) {
        throw new Error('Invalid viewport dimensions');
      }
      
      // Calculate scale to fit content within editor
      const scale = Math.min(
        800 / originalViewport.width,
        1100 / originalViewport.height
      );
      
      const viewport = page.getViewport({ scale });
      
      try {
        // Get text content and prepare canvas for images
        const [textContent, images] = await Promise.all([
          page.getTextContent({ includeMarkedContent: true }).catch(err => {
            console.warn(`Failed to get text content for page ${pageNumber}:`, err);
            return { items: [] };
          }),
          extractImages(page, viewport).catch(err => {
            console.warn(`Failed to extract images from page ${pageNumber}:`, err);
            return [];
          })
        ]);
        
        // Create HTML content with proper text positioning
        let htmlContent = `<div class="pdf-page" contenteditable="true" style="
          width: ${viewport.width}px; 
          height: ${viewport.height}px; 
          position: relative; 
          background-color: white; 
          margin: 20px auto; 
          border: 1px solid #ddd;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          padding: 40px;
          box-sizing: border-box;
        ">`;

        // Add images to the content with improved positioning
        images.forEach((img, index) => {
          if (img && img.dataUrl) {
            htmlContent += `<figure class="image-container" style="
              position: absolute;
              left: ${img.x}px;
              top: ${img.y}px;
              width: ${img.width}px;
              height: ${img.height}px;
              z-index: 1;
              margin: 0;
            ">
              <img 
                src="${img.dataUrl}" 
                id="pdf-img-${pageNumber}-${index}"
                style="
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                "
                data-pdf-img="true"
                alt="PDF Image ${index + 1}"
              />
            </figure>`;
          }
        });

        // Sort text items by their vertical position (top to bottom)
        const sortedItems = textContent.items.sort((a: any, b: any) => {
          const yA = viewport.height - (a.transform ? a.transform[5] : 0);
          const yB = viewport.height - (b.transform ? b.transform[5] : 0);
          return yA - yB || (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0);
        });

        // Group text items by lines based on their Y position
        let currentY: number | null = null;
        let currentLine: any[] = [];
        const lines: any[][] = [];
        const yThreshold = 2;

        sortedItems.forEach((item: any) => {
          if (!item.transform) return;
          const y = viewport.height - item.transform[5];
          
          if (currentY === null || Math.abs(y - currentY) > yThreshold) {
            if (currentLine.length > 0) {
              lines.push([...currentLine]);
            }
            currentLine = [item];
            currentY = y;
          } else {
            currentLine.push(item);
          }
        });
        
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }

        // Process each line
        lines.forEach(line => {
          if (line.length === 0) return;
          
          const fontSize = Math.abs(line[0].transform[0]) * scale;
          
          htmlContent += `<p style="
            margin: 0 0 0.2em 0;
            padding: 0;
            font-size: ${fontSize}px;
            line-height: 1.3;
            color: #000000;
            background-color: rgba(255, 255, 255, 0.7);
          ">`;
          
          // Add text content with preserved spacing
          line.forEach((item: any, index: number) => {
            if (index > 0) {
              const prevItem = line[index - 1];
              const prevX = prevItem.transform[4] + (prevItem.width || 0) * scale;
              const currentX = item.transform[4];
              const spacingNeeded = (currentX - prevX) / fontSize;
              if (spacingNeeded > 0.1) {
                htmlContent += '&nbsp;'.repeat(Math.round(spacingNeeded));
              }
            }
            
            htmlContent += item.str;
          });
          
          htmlContent += '</p>';
        });

        htmlContent += '</div>';

        return {
          content: htmlContent,
          width: viewport.width,
          height: viewport.height,
          scale: scale,
          images: images
        };
      } catch (error) {
        console.error('Error rendering page content:', error);
        // Return a basic page with error message
        return {
          content: `<div class="pdf-page" contenteditable="true" style="
            width: ${viewport.width}px; 
            height: ${viewport.height}px; 
            position: relative; 
            background-color: white; 
            margin: 20px auto; 
            border: 1px solid #ddd;
            padding: 40px;
            box-sizing: border-box;
          ">
            <p style="color: red;">Error rendering page content. The page may be corrupted or contain unsupported elements.</p>
          </div>`,
          width: viewport.width,
          height: viewport.height,
          scale: scale,
          images: []
        };
      }
    } catch (error) {
      console.error('Error rendering page:', error);
      return null;
    }
  };

  const handleEditorChange = (content: string) => {
    if (!editorRef.current) return;
    
    // Store the current selection
    const editor = editorRef.current;
    const selection = editor.selection.getBookmark(2);
    
    setEditedContents(prev => ({
      ...prev,
      [currentPage]: content
    }));
    
    // Update the pages array with edited content
    setPages(prev => {
      const newPages = [...prev];
      newPages[currentPage - 1] = {
        ...newPages[currentPage - 1],
        editedContent: content
      };
      return newPages;
    });
    
    // Restore the selection after the update
    editor.selection.moveToBookmark(selection);
  };

  const handlePageChange = async (newPage: number) => {
    if (editorRef.current) {
      // Save current content before changing page
      const content = editorRef.current.getContent();
      handleEditorChange(content);
    }
    setCurrentPage(newPage);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      // First, process the file locally for image extraction
      const arrayBuffer = await file.arrayBuffer();
      
      // Set PDF.js worker path explicitly
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      
      // Load the PDF with more options and validation
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
        disableFontFace: false,
      });

      // Add loading task error handler
      loadingTask.onPassword = (updatePassword: (password: string) => void, reason: string) => {
        console.error('Password required for PDF:', reason);
        alert('This PDF is password protected. Please provide an unprotected PDF.');
        setIsLoading(false);
        return new Promise(() => {}); // Never resolve to cancel loading
      };

      const pdf = await loadingTask.promise;
      if (!pdf || !pdf.numPages) {
        throw new Error('Invalid PDF document');
      }

      console.log(`PDF loaded with ${pdf.numPages} pages`);
      setTotalPages(pdf.numPages);

      // Process pages locally to extract images and text with colors
      const newPages: PDFPage[] = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log(`Processing page ${pageNum}...`);
        try {
          const page = await renderPage(pdf, pageNum);
          if (page) {
            newPages.push(page);
          } else {
            console.warn(`Failed to render page ${pageNum}`);
          }
        } catch (pageError) {
          console.error(`Error processing page ${pageNum}:`, pageError);
          // Continue with other pages even if one fails
        }
      }

      if (newPages.length === 0) {
        throw new Error('No pages could be processed from the PDF');
      }

      setPages(newPages);
      setCurrentPage(1);
      setEditedContents({});
      
      // Also upload to server for additional processing if needed
      const formData = new FormData();
      formData.append('pdf', file);
      
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.warn('Server-side PDF processing warning:', errorData.error);
          // Continue with client-side processing even if server processing fails
        } else {
          console.log('Server-side PDF processing successful');
          
          // Get the server-processed data
          const serverData = await response.json();
          
          // If the server provided enhanced text content, merge it with our client-side processing
          if (serverData.pages && serverData.pages.length > 0) {
            const enhancedPages = newPages.map((clientPage, index) => {
              if (serverData.pages[index] && serverData.pages[index].enhancedText) {
                // Merge server-side OCR text with client-side rendering
                const serverText = serverData.pages[index].enhancedText;
                
                // Create a temporary div to parse the HTML content
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = clientPage.content;
                
                // Find the pdf-page div
                const pdfPageDiv = tempDiv.querySelector('.pdf-page');
                if (pdfPageDiv) {
                  // Add the server-processed text as a hidden element that can be shown if needed
                  const serverTextDiv = document.createElement('div');
                  serverTextDiv.className = 'server-ocr-text';
                  serverTextDiv.style.display = 'none';
                  serverTextDiv.innerHTML = serverText;
                  pdfPageDiv.appendChild(serverTextDiv);
                  
                  // Update the client page content
                  return {
                    ...clientPage,
                    content: tempDiv.innerHTML
                  };
                }
              }
              return clientPage;
            });
            
            setPages(enhancedPages);
          }
        }
      } catch (serverError) {
        console.warn('Server communication error:', serverError);
        // Continue with client-side processing even if server communication fails
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      alert('Error loading PDF: ' + (error instanceof Error ? error.message : 'Could not process the PDF file. Please try a different file.'));
      setPages([]);
      setTotalPages(0);
      setCurrentPage(1);
      setEditedContents({});
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (!editorRef.current) return;

    try {
      setIsLoading(true);
      // Save current page content before export
      const currentContent = editorRef.current.getContent();
      handleEditorChange(currentContent);

      // Create a container for all pages
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);

      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();

      // Process each page with improved image handling
      for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
        const pageContent = pages[pageNum - 1].editedContent || pages[pageNum - 1].content;
        const pageDiv = document.createElement('div');
        pageDiv.innerHTML = pageContent;
        container.appendChild(pageDiv);

        const pageData = pages[pageNum - 1];
        const pdfPage = pdfDoc.addPage([pageData.width, pageData.height]);

        // Pre-process images to ensure they're loaded
        const images = pageDiv.querySelectorAll('img');
        
        // Create a map to store fixed image sources
        const fixedImageSources = new Map<HTMLImageElement, string>();
        
        // First pass: check for broken images and fix them
        for (const img of Array.from(images)) {
          // Store original src for reference
          const originalSrc = img.src;
          
          // Check if image is already loaded and valid
          if (img.complete && img.naturalWidth === 0) {
            console.warn('Detected broken image:', originalSrc);
            
            // Try to fix the image by re-encoding it if it's a data URL
            if (originalSrc.startsWith('data:')) {
              try {
                // Create a placeholder with the same dimensions
                const canvas = document.createElement('canvas');
                const width = img.width || 200;
                const height = img.height || 200;
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  // Draw a placeholder
                  ctx.fillStyle = '#eeeeee';
                  ctx.fillRect(0, 0, width, height);
                  ctx.fillStyle = '#999999';
                  ctx.font = '14px Arial';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText('Image Error', width/2, height/2);
                  
                  // Replace the source
                  const newSrc = canvas.toDataURL('image/png');
                  fixedImageSources.set(img, newSrc);
                }
              } catch (e) {
                console.error('Failed to create placeholder for broken image:', e);
              }
            }
          }
        }
        
        // Apply fixed sources
        fixedImageSources.forEach((newSrc, img) => {
          img.src = newSrc;
        });

        // Second pass: wait for all images to load
        await Promise.all(Array.from(images).map(img => {
          return new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => {
                console.warn('Failed to load image:', img.src);
                // Try to replace with a placeholder
                try {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.width || 200;
                  canvas.height = img.height || 200;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.fillStyle = '#eeeeee';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#999999';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('Image Error', canvas.width/2, canvas.height/2);
                    img.src = canvas.toDataURL('image/png');
                  }
                } catch (e) {
                  console.error('Failed to create placeholder:', e);
                }
                resolve();
              };
            }
          });
        }));

        // Use html2canvas with improved settings
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(pageDiv.querySelector('.pdf-page')!, {
          scale: 2, // Higher scale for better quality
          useCORS: true,
          allowTaint: true, // Allow cross-origin images
          logging: false,
          backgroundColor: '#ffffff',
          width: pageData.width,
          height: pageData.height,
          imageTimeout: 15000, // Longer timeout for images
          onclone: (clonedDoc) => {
            // Fix any image rendering issues in the cloned document
            const clonedImages = clonedDoc.querySelectorAll('img');
            clonedImages.forEach(img => {
              img.crossOrigin = 'anonymous';
              // Force image dimensions if they exist as attributes
              if (img.getAttribute('width') && img.getAttribute('height')) {
                img.style.width = `${img.getAttribute('width')}px`;
                img.style.height = `${img.getAttribute('height')}px`;
              }
              
              // Check if this image had a fixed source
              const originalImg = images[Array.from(clonedImages).indexOf(img)];
              if (originalImg && fixedImageSources.has(originalImg)) {
                img.src = fixedImageSources.get(originalImg)!;
              }
            });
          }
        });

        // Convert the canvas to a data URL and embed it in the PDF
        // Use JPEG for better compression while maintaining quality
        const imageData = canvas.toDataURL('image/jpeg', 0.92);
        const jpgImage = await pdfDoc.embedJpg(imageData);
        
        pdfPage.drawImage(jpgImage, {
          x: 0,
          y: 0,
          width: pageData.width,
          height: pageData.height
        });

        // Clean up the current page
        container.removeChild(pageDiv);
      }

      // Clean up the container
      document.body.removeChild(container);

      // Save and download the PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'edited-document.pdf';
      link.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error exporting PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        handlePageChange(Math.min(totalPages, currentPage + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        handlePageChange(Math.max(1, currentPage - 1));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [totalPages, currentPage]);

  return (
    <div className="pdf-editor">
      <div className="toolbar">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          className="file-input"
        />
        <button onClick={handleExport} disabled={!pages.length || isLoading} className="export-button">
          Export PDF
        </button>
        <div className="page-navigation">
          <button 
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1 || !pages.length}
            className="nav-button prev-button"
          >
            Previous
          </button>
          <span className="page-info">Page {currentPage} of {totalPages}</span>
          <button 
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages || !pages.length}
            className="nav-button next-button"
          >
            Next
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">
          {isOcrProcessing ? (
            <>
              <div className="ocr-progress">Processing OCR: {ocrProgress}%</div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${ocrProgress}%` }}></div>
              </div>
            </>
          ) : (
            'Loading PDF...'
          )}
        </div>
      ) : (
        pages[currentPage - 1] && (
          <div className="editor-container">
            <Editor
              apiKey={TINYMCE_API_KEY}
              onInit={(evt, editor) => editorRef.current = editor}
              value={pages[currentPage - 1].editedContent || pages[currentPage - 1].content}
              onEditorChange={handleEditorChange}
              init={{
                height: '100%',
                width: '100%',
                menubar: true,
                plugins: [
                  'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                  'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                  'insertdatetime', 'media', 'table', 'help', 'wordcount',
                  'pagebreak', 'nonbreaking', 'template', 'save', 'directionality',
                  'paste', 'textpattern', 'imagetools', 'quickbars', 'emoticons'
                ],
                toolbar: [
                  'undo redo | formatselect | bold italic backcolor forecolor | alignleft aligncenter alignright alignjustify',
                  'bullist numlist outdent indent | removeformat | help | image media | fullscreen',
                  'fontselect fontsizeselect | forecolor backcolor | paste pastetext | table | customToggleSpacing'
                ],
                toolbar_sticky: true,
                toolbar_sticky_offset: 0,
                image_advtab: true,
                extended_valid_elements: 'img[class|src|border=0|alt|title|width|height|style|data-pdf-img]',
                forced_root_block: 'div',
                force_br_newlines: false,
                force_p_newlines: false,
                remove_trailing_brs: false,
                valid_elements: '*[*]',
                valid_children: '+div[p|div|img|span],+p[img|span]',
                auto_focus: undefined,
                min_height: 1123,
                convert_urls: false,
                relative_urls: false,
                remove_script_host: false,
                document_base_url: window.location.origin,
                
                // Paste settings
                paste_data_images: true,
                paste_as_text: false,
                paste_enable_default_filters: true,
                paste_merge_formats: true,
                paste_convert_word_fake_lists: true,
                paste_word_valid_elements: 'p,b,strong,i,em,h1,h2,h3,h4,h5,h6,ul,ol,li,a[href],span,table,tr,td',
                paste_retain_style_properties: 'color,font-size,font-family,text-align',
                
                // Image settings
                image_dimensions: true,
                automatic_uploads: true,
                file_picker_types: 'image',
                images_upload_handler: async (blobInfo, progress) => {
                  try {
                    const blob = blobInfo.blob();
                    const reader = new FileReader();
                    
                    return new Promise((resolve, reject) => {
                      reader.onload = () => {
                        const base64Data = reader.result as string;
                        const img = new Image();
                        img.onload = () => {
                          let width = img.width;
                          let height = img.height;
                          const maxWidth = 700;
                          
                          if (width > maxWidth) {
                            const ratio = maxWidth / width;
                            width = maxWidth;
                            height = height * ratio;
                          }
                          
                          const canvas = document.createElement('canvas');
                          canvas.width = width;
                          canvas.height = height;
                          const ctx = canvas.getContext('2d');
                          
                          if (ctx) {
                            ctx.drawImage(img, 0, 0, width, height);
                            const imageFormat = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
                            const imageQuality = 0.95;
                            resolve(canvas.toDataURL(imageFormat, imageQuality));
                          } else {
                            resolve(base64Data);
                          }
                          
                          if (progress) progress(100);
                        };
                        
                        img.onerror = () => {
                          console.error('Failed to load image');
                          const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiPkltYWdlIEVycm9yPC90ZXh0Pjwvc3ZnPg==';
                          resolve(placeholderImage);
                        };
                        
                        img.crossOrigin = 'anonymous';
                        img.src = base64Data;
                      };
                      
                      reader.onerror = () => {
                        console.error('Failed to read image file');
                        reject('Failed to read image');
                      };
                      
                      reader.readAsDataURL(blob);
                    });
                  } catch (e) {
                    console.error('Image upload error:', e);
                    throw new Error('Failed to process image');
                  }
                },
                
                // Editor appearance
                browser_spellcheck: true,
                contextmenu: 'link image table paste',
                color_cols: 10,
                color_map: [
                  "000000", "Black",
                  "808080", "Gray",
                  "FFFFFF", "White",
                  "FF0000", "Red",
                  "FF8000", "Orange",
                  "FFFF00", "Yellow",
                  "008000", "Green",
                  "0000FF", "Blue",
                  "800080", "Purple",
                  "FF00FF", "Magenta",
                  "008080", "Teal",
                  "000080", "Navy",
                  "808000", "Olive",
                  "800000", "Maroon",
                  "FF9999", "Light Red",
                  "FFCC99", "Light Orange",
                  "FFFF99", "Light Yellow",
                  "99FF99", "Light Green",
                  "99FFFF", "Light Cyan",
                  "9999FF", "Light Blue",
                  "FF99FF", "Light Magenta"
                ],
                
                // Formatting
                formats: {
                  p: { block: 'p', styles: { margin: '0 0 0.2em 0', padding: '0', 'line-height': '1.3' } },
                  h1: { block: 'h1', styles: { margin: '0.5em 0 0.3em', 'line-height': '1.2' } },
                  h2: { block: 'h2', styles: { margin: '0.5em 0 0.3em', 'line-height': '1.2' } },
                  h3: { block: 'h3', styles: { margin: '0.5em 0 0.3em', 'line-height': '1.2' } },
                  h4: { block: 'h4', styles: { margin: '0.5em 0 0.3em', 'line-height': '1.2' } },
                  h5: { block: 'h5', styles: { margin: '0.5em 0 0.3em', 'line-height': '1.2' } },
                  h6: { block: 'h6', styles: { margin: '0.5em 0 0.3em', 'line-height': '1.2' } },
                  link: { inline: 'span', styles: { color: 'inherit', 'text-decoration': 'none' } }
                },
                style_formats: [
                  { title: 'Paragraph', format: 'p' },
                  { title: 'Heading 1', format: 'h1' },
                  { title: 'Heading 2', format: 'h2' },
                  { title: 'Heading 3', format: 'h3' },
                  { title: 'Heading 4', format: 'h4' },
                  { title: 'Heading 5', format: 'h5' },
                  { title: 'Heading 6', format: 'h6' }
                ],
                content_style: `
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: #f5f7fa;
                    min-height: 100vh;
                    overflow-y: auto;
                    color: #2c3e50;
                  }
                  /* Remove all focus outlines */
                  *:focus {
                    outline: none !important;
                  }
                  /* Remove link styling */
                  a, a:hover, a:focus, a:visited {
                    color: inherit !important;
                    text-decoration: none !important;
                    border-bottom: none !important;
                  }
                  /* Remove editor focus styles */
                  .mce-content-body:not([dir=rtl])[data-mce-selected] {
                    outline: none !important;
                    box-shadow: none !important;
                  }
                  .mce-content-body:focus {
                    outline: none !important;
                  }
                  /* Remove selection styling */
                  ::selection {
                    background-color: rgba(74, 144, 226, 0.2);
                    color: inherit;
                  }
                  /* Ensure no text decoration */
                  * {
                    text-decoration: none !important;
                  }
                  /* Remove blue underlines and adjust focus styles */
                  *:focus {
                    outline: none !important;
                  }
                  a {
                    color: inherit;
                    text-decoration: none;
                    border-bottom: none;
                  }
                  a:hover {
                    border-bottom: none;
                  }
                  /* Remove default focus outline from editor elements */
                  .mce-content-body:focus, 
                  .mce-content-body *:focus {
                    outline: none !important;
                  }
                  /* Ensure no underlines on text selection */
                  ::selection {
                    background-color: rgba(74, 144, 226, 0.2);
                    color: inherit;
                    text-decoration: none;
                  }
                  /* Remove underlines from PDF content */
                  .pdf-page * {
                    text-decoration: none !important;
                  }
                  .pdf-page {
                    background-color: white;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    margin: 20px auto;
                    padding: 40px;
                    border: 1px solid #e1e4e8;
                    position: relative;
                    box-sizing: border-box;
                    width: 794px; /* A4 width */
                    min-height: 1123px; /* A4 height */
                    height: auto;
                    overflow: visible;
                    page-break-after: always;
                    break-after: page;
                    display: block;
                    border-radius: 8px;
                    transition: box-shadow 0.3s ease;
                  }
                  .pdf-page:hover {
                    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
                  }
                  .pdf-page:last-child {
                    page-break-after: auto;
                    break-after: auto;
                  }
                  .pdf-page img {
                    max-width: 100%;
                    height: auto !important;
                    display: block;
                    margin: 10px auto;
                    object-fit: contain;
                    border-radius: 4px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                  }
                  .pdf-page img[data-pdf-img="true"] {
                    position: absolute !important;
                    margin: 0 !important;
                    transition: transform 0.2s ease;
                  }
                  .pdf-page img[data-pdf-img="true"]:hover {
                    transform: scale(1.02);
                  }
                  .pdf-page figure {
                    margin: 1.5em 0;
                    text-align: center;
                    background-color: #f8f9fa;
                    padding: 15px;
                    border-radius: 6px;
                  }
                  .pdf-page figure img {
                    display: inline-block;
                    max-width: 90%;
                    margin: 0 auto;
                  }
                  .pdf-page figure figcaption {
                    font-size: 0.9em;
                    color: #6c757d;
                    margin-top: 0.8em;
                    font-style: italic;
                  }
                  .pdf-page div {
                    position: relative;
                    margin: 0;
                    padding: 0;
                    overflow: visible;
                    min-height: 1em;
                    width: 100%;
                    word-wrap: break-word;
                    word-break: normal;
                  }
                  .pdf-page p {
                    margin: 0 0 0.2em 0;
                    padding: 0;
                    position: relative;
                    overflow-wrap: break-word;
                    word-wrap: break-word;
                    word-break: normal;
                    min-height: 1em;
                    width: 100%;
                    line-height: 1.3;
                    color: #2c3e50;
                  }
                  .pdf-page p + p {
                    margin-top: 0;
                  }
                  .pdf-page ul, .pdf-page ol {
                    margin: 0.5em 0;
                    padding-left: 1.5em;
                  }
                  .pdf-page li {
                    margin: 0.2em 0;
                    line-height: 1.3;
                  }
                  .pdf-page span[style*="color"] {
                    display: inline !important;
                    padding: 0 1px;
                    border-radius: 2px;
                  }
                  .pdf-paragraph {
                    margin-bottom: 0.5em !important;
                  }
                  .align-left { 
                    text-align: left !important; 
                  }
                  .align-center { 
                    text-align: center !important; 
                  }
                  .align-right { 
                    text-align: right !important; 
                  }
                  .align-justify { 
                    text-align: justify !important; 
                  }
                  /* Enhanced toolbar styling */
                  .tox-toolbar {
                    background-color: #ffffff !important;
                    border-bottom: 1px solid #e1e4e8 !important;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05) !important;
                  }
                  .tox-toolbar__group {
                    border-color: #e1e4e8 !important;
                  }
                  .tox-tbtn {
                    color: #2c3e50 !important;
                    border-radius: 4px !important;
                    transition: background-color 0.2s ease !important;
                  }
                  .tox-tbtn:hover {
                    background-color: #f0f2f5 !important;
                  }
                  .tox-tbtn--enabled {
                    background-color: #e9ecef !important;
                  }
                  /* Enhanced selection styling */
                  ::selection {
                    background-color: #4a90e2;
                    color: white;
                  }
                  /* Enhanced scrollbar */
                  ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                  }
                  ::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                  }
                  ::-webkit-scrollbar-thumb {
                    background: #c1c1c1;
                    border-radius: 4px;
                  }
                  ::-webkit-scrollbar-thumb:hover {
                    background: #a8a8a8;
                  }
                  /* Enhanced focus styles */
                  *:focus {
                    outline: 2px solid #4a90e2;
                    outline-offset: 2px;
                  }
                  /* Enhanced link styling */
                  a {
                    color: #4a90e2;
                    text-decoration: none;
                    border-bottom: 1px solid transparent;
                    transition: border-color 0.2s ease;
                  }
                  a:hover {
                    border-bottom-color: #4a90e2;
                  }
                  /* Enhanced table styling */
                  table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 1em 0;
                    background-color: white;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                  }
                  th, td {
                    padding: 12px;
                    border: 1px solid #e1e4e8;
                    text-align: left;
                  }
                  th {
                    background-color: #f8f9fa;
                    font-weight: 600;
                    color: #2c3e50;
                  }
                  tr:nth-child(even) {
                    background-color: #f8f9fa;
                  }
                  tr:hover {
                    background-color: #f0f2f5;
                  }
                  /* Enhanced list styling */
                  ul, ol {
                    padding-left: 1.5em;
                    margin: 0.5em 0;
                  }
                  li {
                    margin: 0.2em 0;
                    line-height: 1.3;
                  }
                  /* Enhanced heading styles */
                  h1, h2, h3, h4, h5, h6 {
                    color: #2c3e50;
                    margin: 0.5em 0 0.3em;
                    line-height: 1.2;
                  }
                  h1 { font-size: 2em; }
                  h2 { font-size: 1.75em; }
                  h3 { font-size: 1.5em; }
                  h4 { font-size: 1.25em; }
                  h5 { font-size: 1.1em; }
                  h6 { font-size: 1em; }
                  /* Enhanced blockquote styling */
                  blockquote {
                    margin: 1em 0;
                    padding: 0.5em 1em;
                    border-left: 4px solid #4a90e2;
                    background-color: #f8f9fa;
                    color: #6c757d;
                    font-style: italic;
                  }
                  /* Enhanced code block styling */
                  pre, code {
                    background-color: #f8f9fa;
                    border-radius: 4px;
                    padding: 0.2em 0.4em;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 0.9em;
                    color: #2c3e50;
                  }
                  pre {
                    padding: 1em;
                    overflow-x: auto;
                    margin: 1em 0;
                  }
                  /* Enhanced toolbar and navigation styling */
                  .pdf-editor .toolbar {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    padding: 15px 20px;
                    background-color: #ffffff;
                    border-bottom: 1px solid #e1e4e8;
                    margin-bottom: 20px;
                  }

                  .pdf-editor .file-input {
                    padding: 8px 12px;
                    border: 1px solid #e1e4e8;
                    border-radius: 6px;
                    background-color: #f8f9fa;
                    cursor: pointer;
                    transition: all 0.2s ease;
                  }

                  .pdf-editor .file-input:hover {
                    background-color: #f0f2f5;
                    border-color: #d1d5db;
                  }

                  .pdf-editor .export-button {
                    padding: 8px 16px;
                    background-color: #4a90e2;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s ease;
                  }

                  .pdf-editor .export-button:hover:not(:disabled) {
                    background-color: #357abd;
                  }

                  .pdf-editor .export-button:disabled {
                    background-color: #a8c7eb;
                    cursor: not-allowed;
                  }

                  .pdf-editor .page-navigation {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-left: auto;
                  }

                  .pdf-editor .nav-button {
                    padding: 8px 16px;
                    background-color: #4a90e2;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s ease;
                  }

                  .pdf-editor .nav-button:hover:not(:disabled) {
                    background-color: #357abd;
                  }

                  .pdf-editor .nav-button:disabled {
                    background-color: #a8c7eb;
                    color: white;
                    cursor: not-allowed;
                  }

                  .pdf-editor .page-info {
                    color: #000000;
                    font-size: 14px;
                    padding: 0 10px;
                  }
                `,
                setup: (editor) => {
                  // Store button references and state
                  let prevButton: any = null;
                  let nextButton: any = null;
                  let isFullscreen = false;
                  let isCompactSpacing = true; // Default to compact spacing

                  // Function to toggle paragraph spacing
                  const toggleParagraphSpacing = () => {
                    isCompactSpacing = !isCompactSpacing;
                    
                    // Get all paragraphs in the editor
                    const paragraphs = editor.getBody().querySelectorAll('p');
                    
                    // Apply the appropriate spacing
                    paragraphs.forEach((p: HTMLElement) => {
                      if (isCompactSpacing) {
                        p.style.marginBottom = '0.2em';
                        p.style.lineHeight = '1.3';
                      } else {
                        p.style.marginBottom = '0.8em';
                        p.style.lineHeight = '1.6';
                      }
                    });
                    
                    return isCompactSpacing;
                  };

                  // Add keyboard shortcut for toggling spacing (Ctrl+Alt+S)
                  editor.addShortcut('ctrl+alt+s', 'Toggle paragraph spacing', () => {
                    toggleParagraphSpacing();
                  });

                  // Create a function to update button states
                  const updateButtonStates = () => {
                    if (prevButton) {
                      prevButton.setEnabled(currentPage > 1);
                    }
                    if (nextButton) {
                      nextButton.setEnabled(currentPage < totalPages);
                    }
                  };

                  // Function to handle page changes
                  const handlePageChangeAndUpdate = (newPage: number) => {
                    // Save current content
                    const content = editor.getContent();
                    handleEditorChange(content);
                    
                    // Change page
                    handlePageChange(newPage);
                    
                    // Update button states after a short delay to ensure DOM is updated
                    setTimeout(updateButtonStates, 100);
                  };

                  // Monitor fullscreen changes
                  editor.on('FullscreenStateChanged', (e: any) => {
                    isFullscreen = e.state;
                    setTimeout(updateButtonStates, 100);
                  });

                  // Add custom button to toggle paragraph spacing
                  editor.ui.registry.addToggleButton('toggleSpacing', {
                    icon: 'line-height',
                    tooltip: 'Toggle paragraph spacing (Ctrl+Alt+S)',
                    onAction: toggleParagraphSpacing,
                    onSetup: (api) => {
                      api.setActive(isCompactSpacing);
                      return () => {};
                    }
                  });

                  // Add the toggle spacing button to the toolbar
                  editor.ui.registry.addButton('customToggleSpacing', {
                    icon: 'line-height',
                    tooltip: 'Toggle paragraph spacing (Ctrl+Alt+S)',
                    onAction: toggleParagraphSpacing
                  });

                  // Rest of button setup
                  editor.ui.registry.addButton('customPrevPage', {
                    text: 'Previous',
                    icon: 'chevron-left',
                    tooltip: 'Previous Page',
                    onAction: () => {
                      if (currentPage > 1) {
                        handlePageChangeAndUpdate(currentPage - 1);
                      }
                    },
                    onSetup: (api) => {
                      prevButton = api;
                      api.setEnabled(currentPage > 1);
                      
                      editor.on('init', updateButtonStates);
                      editor.on('NodeChange', updateButtonStates);
                      editor.on('FullscreenStateChanged', updateButtonStates);

                      return () => {
                        prevButton = null;
                        editor.off('init', updateButtonStates);
                        editor.off('NodeChange', updateButtonStates);
                        editor.off('FullscreenStateChanged', updateButtonStates);
                      };
                    }
                  });
                  
                  editor.ui.registry.addButton('customNextPage', {
                    text: 'Next',
                    icon: 'chevron-right',
                    tooltip: 'Next Page',
                    onAction: () => {
                      if (currentPage < totalPages) {
                        handlePageChangeAndUpdate(currentPage + 1);
                      }
                    },
                    onSetup: (api) => {
                      nextButton = api;
                      api.setEnabled(currentPage < totalPages);
                      
                      editor.on('init', updateButtonStates);
                      editor.on('NodeChange', updateButtonStates);
                      editor.on('FullscreenStateChanged', updateButtonStates);

                      return () => {
                        nextButton = null;
                        editor.off('init', updateButtonStates);
                        editor.off('NodeChange', updateButtonStates);
                        editor.off('FullscreenStateChanged', updateButtonStates);
                      };
                    }
                  });

                  // Function to check content height and create new pages
                  const checkContentAndCreatePage = () => {
                    const body = editor.getBody();
                    const pages = body.querySelectorAll('.pdf-page');
                    const lastPage = pages[pages.length - 1] as HTMLElement;
                    
                    if (lastPage && lastPage.offsetHeight > 1123) {
                      // Create a new page first
                      const newPage = document.createElement('div');
                      newPage.className = 'pdf-page';
                      lastPage.parentNode?.insertBefore(newPage, lastPage.nextSibling);

                      // Find the overflow point
                      let currentHeight = 0;
                      let overflowNode: HTMLElement | null = null;
                      
                      // Iterate through child nodes to find overflow point
                      Array.from(lastPage.children).forEach((node) => {
                        if (node instanceof HTMLElement) {
                          currentHeight += node.offsetHeight;
                          if (currentHeight > 1123 && !overflowNode) {
                            overflowNode = node;
                          }
                        }
                      });

                      if (overflowNode) {
                        // Move the overflow node and all subsequent nodes
                        let currentNode: HTMLElement | null = overflowNode;
                        while (currentNode) {
                          const nextNode = currentNode.nextElementSibling as HTMLElement;
                          newPage.appendChild(currentNode);
                          currentNode = nextNode;
                        }

                        // Update total pages
                        setTotalPages(pages.length + 1);
                        
                        // Trigger content update
                        editor.fire('NodeChange');
                      }
                    }
                  };

                  // Handle content changes with debounce
                  let debounceTimeout: NodeJS.Timeout;
                  const debouncedCheck = () => {
                    clearTimeout(debounceTimeout);
                    debounceTimeout = setTimeout(checkContentAndCreatePage, 100);
                  };

                  editor.on('NodeChange', debouncedCheck);
                  editor.on('KeyUp', debouncedCheck);
                  editor.on('Change', debouncedCheck);

                  // Initialize editor with first page
                  editor.on('init', () => {
                    const content = editor.getContent();
                    if (!content.includes('pdf-page')) {
                      editor.setContent('<div class="pdf-page">' + content + '</div>');
                    }
                    
                    // Apply compact spacing to all paragraphs on initialization
                    setTimeout(() => {
                      const paragraphs = editor.getBody().querySelectorAll('p');
                      paragraphs.forEach((p: HTMLElement) => {
                        p.style.marginBottom = '0.2em';
                        p.style.lineHeight = '1.3';
                      });
                    }, 100);
                    
                    updateButtonStates();
                  });
                }
              }}
            />
            <div className="bottom-navigation">
              <button 
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1 || !pages.length}
                className="nav-button bottom-nav-button prev-button"
              >
                Previous
              </button>
              <button 
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages || !pages.length}
                className="nav-button bottom-nav-button next-button"
              >
                Next
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default PDFEditor;