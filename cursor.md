check the complete code each time you make a change

Develop a web-based PDF editor that allows users to upload a PDF, edit its content in a web editor, and export the modified document back to PDF while preserving the original formatting.

### **Features:**
✅ Upload and parse PDFs into an editable format while retaining layout, fonts, images, and styles.  
✅ Integrate a rich-text editor (TinyMCE or CKEditor) for user modifications.  
✅ Export edited content back into a well-structured PDF with minimal format loss.

### **Tech Stack:**  
- **Backend:** Flask/Django (Python) or Node.js  
- **PDF Parsing:** PyMuPDF (fitz), pdf2htmlEX, or pdf.js  
- **Web Editor:** TinyMCE or CKEditor  
- **PDF Export:** WeasyPrint, wkhtmltopdf, or jspdf  

### **Implementation Steps:**  
1️⃣ **Convert PDF to an Editable Web Format:**  
   - Extract text and formatting using pdf2htmlEX or pdf.js  
   - Display the content inside TinyMCE/CKEditor for modifications  

2️⃣ **Enable User Edits with Rich Text Formatting:**  
   - Support text styling (bold, italic, alignment, font changes)  
   - Ensure image and table preservation  

3️⃣ **Save & Re-Export as PDF:**  
   - Convert edited content to a PDF while retaining structure  
   - Use WeasyPrint or wkhtmltopdf for HTML-to-PDF conversion  

### **Deliverables:**  
📌 Fully functional web application with PDF import, editing, and export features  
📌 GitHub repository with complete code and installation instructions  
📌 Demo video or screenshots showcasing the editor in action  

### **Expected Output:**  
A seamless online PDF editor that maintains document fidelity while allowing rich edits. Ensure high accuracy in formatting preservation and an intuitive UI.  

please remember what you are doing and what you have done ,and check the complete code each time you make a change

also remember the file structure and the file names and the file paths

and above problem statement given by user is very important and you should follow it strictly



this is the API Key for the TinyMCE editor make sure api error is not shown in the console while using it
f1tx56c31hjm3x5zrk6i9jc89s20ha67t6wgqes00tc004tj
