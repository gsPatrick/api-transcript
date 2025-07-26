// src/features/Agent/agent.controller.js
const agentService = require('./agent.service');
const path = require('path');

const agentController = {
  /**
   * Executa uma ação de agente de IA.
   */
  async runAgent(req, res, next) {
    try {
      const userId = req.user.userId;
      const { agentId, transcriptionId } = req.body;

      if (!agentId || !transcriptionId) {
        return res.status(400).json({ message: 'ID do agente e ID da transcrição são obrigatórios.' });
      }

      const agentAction = await agentService.runAgent(userId, agentId, transcriptionId);

      // Retorna uma resposta imediata enquanto a ação é processada em segundo plano
      return res.status(202).json({
        message: 'Ação do agente iniciada com sucesso. O resultado estará disponível em breve.',
        agentActionId: agentAction.id,
        status: agentAction.status,
        checkStatusUrl: `/api/agents/my-actions/${agentAction.id}`,
      });

    } catch (error) {
      console.error('Erro no controller runAgent:', error);
      if (error.message.includes('não encontrado') || error.message.includes('permissão') || error.message.includes('limite') || error.message.includes('plano ativo') || error.message.includes('chave da OpenAI')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Lista as ações de agente do usuário logado.
   */
  async listMyAgentActions(req, res, next) {
    try {
      const userId = req.user.userId;
      const filters = req.query; // status, page, limit

      const result = await agentService.listUserAgentActions(userId, filters);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Erro no controller listMyAgentActions:', error);
      next(error);
    }
  },

  /**
   * Busca uma ação de agente específica pelo ID.
   */
  async getAgentAction(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const agentAction = await agentService.getAgentActionById(id, userId);
      return res.status(200).json(agentAction);
    } catch (error) {
      console.error('Erro no controller getAgentAction:', error);
      if (error.message.includes('não encontrada') || error.message.includes('permissão')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Faz o download do arquivo de saída de uma ação de agente (se for PDF).
   */
  async downloadAgentActionOutput(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const filePath = await agentService.getAgentActionOutputFile(id, userId);

      // Obtém o nome do arquivo para o download
      const fileName = path.basename(filePath);

      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Erro ao enviar arquivo para download:', err);
          // Se o arquivo não puder ser enviado, mas existe, não é um erro 404
          if (!res.headersSent) {
            return res.status(500).json({ message: 'Erro ao fazer download do arquivo.' });
          }
        }
      });
    } catch (error) {
      console.error('Erro no controller downloadAgentActionOutput:', error);
      if (error.message.includes('não encontrado') || error.message.includes('disponível')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Lista os agentes de IA disponíveis para o usuário logado.
   */
  async listAvailableAgents(req, res, next) {
    try {
      const userId = req.user.userId;
      const agents = await agentService.listAvailableAgents(userId);
      return res.status(200).json(agents);
    } catch (error) {
      console.error('Erro no controller listAvailableAgents:', error);
      next(error);
    }
  },

  /**
   * Permite ao usuário criar seu próprio agente de IA.
   */
  async createUserAgent(req, res, next) {
    try {
      const userId = req.user.userId;
      const agentData = req.body;

      if (!agentData.name || !agentData.promptTemplate || !agentData.modelUsed) {
        return res.status(400).json({ message: 'Nome, prompt template e modelo de IA são obrigatórios para criar um agente.' });
      }

      const newAgent = await agentService.createUserAgent(userId, agentData);
      return res.status(201).json({ message: 'Agente criado com sucesso!', agent: newAgent });
    } catch (error) {
      console.error('Erro no controller createUserAgent:', error);
      if (error.message.includes('plano não permite')) {
        return res.status(403).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Permite ao usuário atualizar seu próprio agente de IA.
   */
  async updateUserAgent(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const updateData = req.body;

      const updatedAgent = await agentService.updateUserAgent(id, userId, updateData);
      return res.status(200).json({ message: 'Agente atualizado com sucesso!', agent: updatedAgent });
    } catch (error) {
      console.error('Erro no controller updateUserAgent:', error);
      if (error.message.includes('não encontrado') || error.message.includes('permissão')) {
        return res.status(404).json({ message: error.message });
      }
      if (error.message.includes('plano não permite')) {
        return res.status(403).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Permite ao usuário deletar seu próprio agente de IA.
   */
  async deleteUserAgent(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const result = await agentService.deleteUserAgent(id, userId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Erro no controller deleteUserAgent:', error);
      if (error.message.includes('não encontrado') || error.message.includes('permissão')) {
        return res.status(404).json({ message: error.message });
      }
      if (error.message.includes('plano não permite')) {
        return res.status(403).json({ message: error.message });
      }
      next(error);
    }
  },


};

module.exports = agentController;