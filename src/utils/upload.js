// src/utils/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Cria a pasta de uploads se ela não existir
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração de armazenamento do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Onde os arquivos serão salvos
  },
  filename: (req, file, cb) => {
    // Gera um nome de arquivo único para evitar colisões
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// Filtro para aceitar apenas arquivos de áudio
const fileFilter = (req, file, cb) => {
  // Tipos MIME de áudio comuns que o Whisper aceita
  const allowedMimeTypes = [
    'audio/mpeg', // .mp3
    'audio/wav',  // .wav
    'audio/x-wav',
    'audio/aac',  // .aac
    'audio/ogg',  // .ogg
    'audio/webm', // .webm
    'audio/mp4',  // .m4a (MPEG-4 Audio)
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Aceita o arquivo
  } else {
    cb(new Error('Tipo de arquivo não suportado. Apenas arquivos de áudio são permitidos (mp3, wav, m4a, ogg, webm, aac).'), false);
  }
};

// Configuração final do Multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // Limite de 25MB por arquivo (limite do Whisper)
  },
});

module.exports = upload;