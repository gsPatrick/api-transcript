// src/features/Transcription/transcription.controller.js
const transcriptionService = require('./transcription.service');

const transcriptionController = {
  /**
   * Endpoint para upload e transcrição de áudio.
   * Usa `upload.single('audioFile')` do Multer para lidar com o arquivo.
   */
  async uploadAndTranscribe(req, res, next) {
    try {
      const userId = req.user.userId; // ID do usuário do token JWT

      if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo de áudio foi enviado.' });
      }

      const transcription = await transcriptionService.createTranscription(userId, req.file);

      // Retorna uma resposta imediata enquanto a transcrição é processada em segundo plano
      return res.status(202).json({
        message: 'Transcrição iniciada com sucesso. O processamento pode levar alguns minutos.',
        transcriptionId: transcription.id,
        status: transcription.status,
        originalFileName: transcription.originalFileName,
        checkStatusUrl: `/api/transcriptions/status/${transcription.id}`,
        // Não retorna o audioPath por segurança
      });

    } catch (error) {
      console.error('Erro no controller uploadAndTranscribe:', error);
      if (error.message.includes('plano ativo') || error.message.includes('Limite de transcrições') || error.message.includes('Tipo de arquivo não suportado')) {
        return res.status(400).json({ message: error.message });
      }
      next(error); // Passa para o middleware de tratamento de erros
    }
  },

  /**
   * Lista as transcrições do usuário logado.
   */
  async listMyTranscriptions(req, res, next) {
    try {
      const userId = req.user.userId;
      const filters = req.query; // status, page, limit

      const result = await transcriptionService.listUserTranscriptions(userId, filters);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Erro no controller listMyTranscriptions:', error);
      next(error);
    }
  },

  /**
   * Busca uma transcrição específica pelo ID.
   */
  async getTranscription(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const transcription = await transcriptionService.getTranscriptionById(id, userId);
      return res.status(200).json(transcription);
    } catch (error) {
      console.error('Erro no controller getTranscription:', error);
      if (error.message.includes('não encontrada') || error.message.includes('permissão')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Obtém o uso atual do plano do usuário logado.
   */
  async getMyPlanUsage(req, res, next) {
    try {
      const userId = req.user.userId;
      const usage = await transcriptionService.getUserPlanUsage(userId);
      return res.status(200).json(usage);
    } catch (error) {
      console.error('Erro no controller getMyPlanUsage:', error);
      next(error);
    }
  }
};

module.exports = transcriptionController;