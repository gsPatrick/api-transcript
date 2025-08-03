// src/utils/pdfGenerator.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const pdfGenerator = {
  /**
   * Gera um arquivo PDF a partir de um texto.
   * @param {string} textContent - O texto a ser incluído no PDF.
   * @param {string} fileName - O nome do arquivo PDF a ser salvo (sem extensão).
   * @param {string} [outputDir] - O diretório onde o PDF será salvo. Padrão para 'src/uploads'.
   * @returns {Promise<string>} O caminho completo do arquivo PDF gerado.
   */
  async generateTextPdf(textContent, fileName, outputDir = null) {
    // Se um diretório de saída não for fornecido, usa o padrão antigo
    const uploadsDir = outputDir || path.join(__dirname, '..', 'uploads');
    
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, `${fileName}.pdf`);
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    doc.fontSize(12).text(textContent, {
      align: 'left',
      indent: 20,
      paragraphGap: 10,
    });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filePath));
      stream.on('error', (err) => {
        console.error('Erro ao gerar PDF:', err);
        reject(err);
      });
    });
  },
};

module.exports = pdfGenerator;