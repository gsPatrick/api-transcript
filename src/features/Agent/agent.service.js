// src/features/Agent/agent.service.js
const db = require('../../config/database');
const openai = require('../../config/openai'); // Instância da OpenAI com token do sistema
const pdfGenerator = require('../../utils/pdfGenerator'); // Para gerar PDFs
const path = require('path');
const fs = require('fs/promises'); // Para manipulação de arquivos

const { User, Plan, Agent, AgentAction, Transcription } = db;

const agentService = {
  /**
   * Executa uma ação de agente de IA.
   * @param {string} userId - ID do usuário.
   * @param {string} agentId - ID do agente a ser usado.
   * @param {string} transcriptionId - ID da transcrição a ser usada como input.
   * @returns {object} O registro da ação do agente.
   */
  async runAgent(userId, agentId, transcriptionId) {
    let agentActionRecord;
    try {
      const user = await User.findByPk(userId, {
        include: [{ model: Plan, as: 'currentPlan' }],
      });
      const agent = await Agent.findByPk(agentId);
      const transcription = await Transcription.findByPk(transcriptionId);

      if (!user) throw new Error('Usuário não encontrado.');
      if (!agent) throw new Error('Agente de IA não encontrado.');
      if (!transcription) throw new Error('Transcrição não encontrada.');
      if (transcription.userId !== userId) throw new Error('Você não tem permissão para usar esta transcrição.');
      if (transcription.status !== 'completed') throw new Error('A transcrição ainda não foi concluída.');

      const plan = user.currentPlan;
      if (!plan || user.planExpiresAt < new Date()) {
        throw new Error('Você não tem um plano ativo. Por favor, adquira um plano.');
      }

      const planFeatures = plan.features;

      // 1. Verificar Limites de Uso de Agentes
      if (planFeatures.maxAgentUses !== -1 && user.agentUsesUsed >= planFeatures.maxAgentUses) {
        throw new Error('Limite de uso de agentes de IA atingido para o seu plano.');
      }

      // 2. Verificar Permissões do Agente
      let isAgentAllowed = false;
      if (agent.isSystemAgent) {
        // Se for um agente do sistema, verifica se o plano o permite (se allowedSystemAgentIds não estiver vazio)
        if (planFeatures.allowedSystemAgentIds && planFeatures.allowedSystemAgentIds.length > 0) {
          isAgentAllowed = planFeatures.allowedSystemAgentIds.includes(agent.id);
        } else {
          // Se allowedSystemAgentIds estiver vazio, todos os agentes do sistema são permitidos
          isAgentAllowed = true;
        }
      } else {
        // Se for um agente do usuário, verifica se o plano permite criação de agentes e se o usuário é o criador
        if (planFeatures.allowUserAgentCreation && agent.createdByUserId === userId) {
          isAgentAllowed = true;
        }
      }

      if (!isAgentAllowed) {
        throw new Error('Seu plano não permite o uso deste agente de IA ou você não é o criador.');
      }

      // 3. Determinar qual token da OpenAI usar
      let openaiInstanceToUse = openai; // Por padrão, usa o token do sistema
      let usedSystemToken = true;

      if (agent.requiresUserOpenAiToken) {
        if (!user.openAiApiKey) {
          throw new Error('Este agente requer que você forneça sua própria chave da OpenAI. Configure-a em seu perfil.');
        }
        openaiInstanceToUse = new openai.OpenAI({ apiKey: user.openAiApiKey });
        usedSystemToken = false;
      } else if (!agent.isSystemAgent) {
        // Agente criado pelo usuário sempre usa o token do usuário (se não for systemAgent e não exigir token do user explicitamente)
        if (!user.openAiApiKey) {
          throw new Error('Para usar seu próprio agente, você deve fornecer sua chave da OpenAI. Configure-a em seu perfil.');
        }
        openaiInstanceToUse = new openai.OpenAI({ apiKey: user.openAiApiKey });
        usedSystemToken = false;
      } else { // É um agente do sistema e não exige token do usuário
        if (planFeatures.allowUserProvideOwnAgentToken && user.openAiApiKey) {
          // Se o plano permite e o usuário tem um token, ele pode optar por usar o próprio
          // Por simplicidade, assumimos que se o token do usuário existe e o plano permite, ele usa.
          // Poderíamos adicionar um parâmetro na requisição para o usuário escolher.
          openaiInstanceToUse = new openai.OpenAI({ apiKey: user.openAiApiKey });
          usedSystemToken = false;
        } else if (!planFeatures.useSystemTokenForSystemAgents) {
          // Se o plano não permite o uso do token do sistema para agentes do sistema
          throw new Error('Seu plano não permite o uso de agentes do sistema com o token da plataforma. Por favor, forneça sua própria chave da OpenAI ou adquira um plano diferente.');
        }
        // Caso contrário, usa openaiInstanceToUse (que é o token do sistema) e usedSystemToken (true)
      }

      // 4. Criar registro inicial da ação do agente no DB como 'pending'
      agentActionRecord = await AgentAction.create({
        userId: user.id,
        agentId: agent.id,
        transcriptionId: transcription.id,
        inputText: transcription.transcriptionText,
        outputFormat: agent.outputFormat,
        status: 'pending',
        usedSystemToken: usedSystemToken,
      });

      // Iniciar a execução do agente em segundo plano
      this._processAgentActionInBackground(agentActionRecord.id, openaiInstanceToUse, agent, transcription.transcriptionText, user);

      return agentActionRecord;

    } catch (error) {
      console.error('Erro ao iniciar ação do agente:', error);
      if (agentActionRecord) {
        await agentActionRecord.update({ status: 'failed', errorMessage: error.message });
      }
      throw error;
    }
  },

  /**
   * Processa a ação do agente com a API da OpenAI em segundo plano.
   * @param {string} agentActionId - ID do registro de AgentAction.
   * @param {object} openaiClient - Instância do cliente OpenAI (com token do sistema ou do usuário).
   * @param {object} agent - Objeto do agente.
   * @param {string} inputText - Texto de entrada para o agente.
   * @param {object} user - Objeto do usuário (para atualizar o uso).
   * @private
   */
  async _processAgentActionInBackground(agentActionId, openaiClient, agent, inputText, user) {
    let agentActionRecord;
    try {
      agentActionRecord = await AgentAction.findByPk(agentActionId);
      if (!agentActionRecord) {
        console.error(`Registro de ação do agente ${agentActionId} não encontrado para processamento.`);
        return;
      }

      await agentActionRecord.update({ status: 'processing' });

      // 1. Preparar o prompt
      const finalPrompt = agent.promptTemplate.replace('{text}', inputText);

      // 2. Chamar a API da OpenAI
      const chatCompletion = await openaiClient.chat.completions.create({
        model: agent.modelUsed,
        messages: [{ role: 'user', content: finalPrompt }],
        // max_tokens: 1000, // Opcional: limite de tokens na resposta
      });

      const outputText = chatCompletion.choices[0].message.content;
      // Opcional: calcular custo baseado em chatCompletion.usage (input_tokens, output_tokens)
      // const cost = calculateOpenAICost(chatCompletion.usage, agent.modelUsed);

      let outputFilePath = null;
      if (agent.outputFormat === 'pdf') {
        // 3. Gerar PDF se o formato de saída for PDF
        const fileName = `agent_output_${agentActionId}`;
        outputFilePath = await pdfGenerator.generateTextPdf(outputText, fileName);
        console.log(`PDF gerado em: ${outputFilePath}`);
      }

      // 4. Atualizar o registro da ação do agente no DB
      await agentActionRecord.update({
        outputText: outputText,
        outputFilePath: outputFilePath ? path.relative(path.join(__dirname, '..', 'uploads'), outputFilePath) : null, // Salva caminho relativo
        status: 'completed',
        // cost: cost, // Atualizar custo
      });

      // 5. Atualizar o consumo de uso de agentes do usuário
      await user.increment('agentUsesUsed', { by: 1 }); // Incrementa diretamente no DB

      console.log(`Ação do agente ${agentActionId} concluída e uso do usuário ${user.id} atualizado.`);

    } catch (error) {
      console.error(`Erro durante o processamento da ação do agente ${agentActionId}:`, error);
      const errorMessage = error.response ? error.response.data : error.message;
      if (agentActionRecord) {
        await agentActionRecord.update({ status: 'failed', errorMessage: `Erro na API de IA: ${errorMessage}` });
      }
      // Se um PDF foi gerado antes da falha final, você pode querer deletá-lo
      if (agentActionRecord && agentActionRecord.outputFilePath) {
        const fullPath = path.join(__dirname, '..', 'uploads', agentActionRecord.outputFilePath);
        await fs.unlink(fullPath).catch(err => console.error('Erro ao deletar PDF após falha:', err));
      }
    }
  },

  /**
   * Lista as ações de agente de um usuário.
   * @param {string} userId - ID do usuário.
   * @param {object} filters - Filtros de paginação e status.
   * @returns {object} Lista de ações de agente.
   */
  async listUserAgentActions(userId, filters = {}) {
    try {
      const { status, page = 1, limit = 10 } = filters;
      const where = { userId };

      if (status) where.status = status;

      const offset = (page - 1) * limit;

      const { count, rows } = await AgentAction.findAndCountAll({
        where,
        include: [
          { model: Agent, as: 'agent', attributes: ['id', 'name', 'description', 'outputFormat'] },
          { model: Transcription, as: 'transcription', attributes: ['id', 'originalFileName'] }
        ],
        limit: Number.parseInt(limit),
        offset,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: ['outputFilePath'] } // Não expõe o caminho do arquivo no servidor diretamente
      });

      return {
        agentActions: rows,
        total: count,
        totalPages: Math.ceil(count / limit),
        currentPage: Number.parseInt(page),
      };
    } catch (error) {
      console.error('Erro ao listar ações de agente do usuário:', error);
      throw error;
    }
  },

  /**
   * Busca uma ação de agente específica de um usuário.
   * @param {string} agentActionId - ID da ação do agente.
   * @param {string} userId - ID do usuário (para segurança).
   * @returns {object} A ação do agente encontrada.
   */
  async getAgentActionById(agentActionId, userId) {
    try {
      const agentAction = await AgentAction.findOne({
        where: { id: agentActionId, userId },
        include: [
          { model: Agent, as: 'agent', attributes: ['id', 'name', 'description', 'outputFormat'] },
          { model: Transcription, as: 'transcription', attributes: ['id', 'originalFileName'] }
        ]
      });

      if (!agentAction) {
        throw new Error('Ação do agente não encontrada ou você não tem permissão para acessá-la.');
      }
      return agentAction;
    } catch (error) {
      console.error('Erro ao buscar ação do agente por ID:', error);
      throw error;
    }
  },

  /**
   * Fornece o caminho completo para download de um arquivo de saída de agente.
   * @param {string} agentActionId - ID da ação do agente.
   * @param {string} userId - ID do usuário.
   * @returns {string} Caminho completo do arquivo para download.
   */
  async getAgentActionOutputFile(agentActionId, userId) {
    try {
      const agentAction = await AgentAction.findOne({
        where: { id: agentActionId, userId, status: 'completed', outputFormat: 'pdf' },
      });

      if (!agentAction || !agentAction.outputFilePath) {
        throw new Error('Arquivo de saída não encontrado ou não disponível para download.');
      }

      // Construir o caminho completo do arquivo
      const fullPath = path.join(__dirname, '..', 'uploads', agentAction.outputFilePath);

      // Verificar se o arquivo existe
      await fs.access(fullPath);

      return fullPath;
    } catch (error) {
      console.error('Erro ao obter arquivo de saída do agente:', error);
      throw error;
    }
  },

  /**
   * Lista os agentes disponíveis para um usuário baseado no seu plano.
   * @param {string} userId - ID do usuário.
   * @returns {Array<object>} Lista de agentes disponíveis.
   */
  async listAvailableAgents(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [{ model: Plan, as: 'currentPlan' }],
      });

      if (!user) throw new Error('Usuário não encontrado.');

      const plan = user.currentPlan;
      // Se não tem plano ativo, ou plano expirou, não deve ver agentes ou criar
      if (!plan || user.planExpiresAt < new Date()) {
        return [];
      }

      const planFeatures = plan.features;
      const userPlanId = plan.id; // ID do plano atual do usuário

      let availableAgents = [];

      // 1. Agentes do sistema
      const allSystemAgents = await Agent.findAll({
        where: { isSystemAgent: true },
        attributes: ['id', 'name', 'description', 'outputFormat', 'modelUsed', 'isSystemAgent', 'requiresUserOpenAiToken', 'planSpecific', 'allowedPlanIds']
      });

      allSystemAgents.forEach(agent => {
        let isAllowedByPlanFeatures = true; // Assume que é permitido pelo plano (whitelist)
        let isAllowedByAgentRestriction = true; // Assume que é permitido pela restrição do agente

        // Verifica a whitelist do plano (se o plano tem uma lista específica de agentes do sistema permitidos)
        if (planFeatures.allowedSystemAgentIds && planFeatures.allowedSystemAgentIds.length > 0) {
          isAllowedByPlanFeatures = planFeatures.allowedSystemAgentIds.includes(agent.id);
        }

        // Verifica a restrição específica do agente (se o agente é restrito a certos planos)
        if (agent.planSpecific && agent.allowedPlanIds && agent.allowedPlanIds.length > 0) {
          isAllowedByAgentRestriction = agent.allowedPlanIds.includes(userPlanId);
        }

        if (isAllowedByPlanFeatures && isAllowedByAgentRestriction) {
          availableAgents.push(agent);
        }
      });

      // 2. Agentes criados pelo próprio usuário (se o plano permitir)
      if (planFeatures.allowUserAgentCreation) {
        const userAgents = await Agent.findAll({
          where: { isSystemAgent: false, createdByUserId: userId },
          attributes: ['id', 'name', 'description', 'outputFormat', 'modelUsed', 'isSystemAgent', 'requiresUserOpenAiToken', 'planSpecific', 'allowedPlanIds']
        });
        availableAgents = availableAgents.concat(userAgents);
      }

      // Remove duplicatas (caso um agente seja adicionado por ambas as lógicas, embora improvável)
      const uniqueAgents = Array.from(new Map(availableAgents.map(agent => [agent.id, agent])).values());

      return uniqueAgents;

    } catch (error) {
      console.error('Erro ao listar agentes disponíveis:', error);
      throw error;
    }
  },

  /**
   * Permite ao usuário criar seu próprio agente de IA.
   * @param {string} userId - ID do usuário criador.
   * @param {object} agentData - Dados do agente (name, description, promptTemplate, outputFormat, modelUsed, requiresUserOpenAiToken).
   * @returns {object} O agente criado.
   */
  async createUserAgent(userId, agentData) {
    const user = await User.findByPk(userId, {
      include: [{ model: Plan, as: 'currentPlan' }],
    });

    if (!user) throw new Error('Usuário não encontrado.');
    const plan = user.currentPlan;
    if (!plan || user.planExpiresAt < new Date()) {
      throw new Error('Você não tem um plano ativo. Por favor, adquira um plano.');
    }

    const planFeatures = plan.features;
    if (!planFeatures.allowUserAgentCreation) {
      throw new Error('Seu plano não permite a criação de agentes de IA personalizados.');
    }

    // Garante que é um agente do usuário e que o criador é o usuário logado
    agentData.isSystemAgent = false;
    agentData.createdByUserId = userId;

    // Agentes do usuário sempre requerem o token do usuário para uso (mesmo que o campo diga false, a lógica de uso impõe)
    // Mas podemos permitir que ele defina se *ele mesmo* quer que o agente *exija* o token do usuário,
    // para que outros usuários com o mesmo plano possam usar se você implementar compartilhamento.
    // Por enquanto, vamos forçar para true, pois a lógica atual só permite uso do criador.
    // agentData.requiresUserOpenAiToken = true;

    const newAgent = await Agent.create(agentData);
    return newAgent;
  },

  /**
   * Permite ao usuário atualizar seu próprio agente de IA.
   * @param {string} agentId - ID do agente a ser atualizado.
   * @param {string} userId - ID do usuário criador.
   * @param {object} updateData - Dados para atualização.
   * @returns {object} O agente atualizado.
   */
  async updateUserAgent(agentId, userId, updateData) {
    const user = await User.findByPk(userId, {
      include: [{ model: Plan, as: 'currentPlan' }],
    });

    if (!user) throw new Error('Usuário não encontrado.');
    const plan = user.currentPlan;
    if (!plan || user.planExpiresAt < new Date()) {
      throw new Error('Você não tem um plano ativo. Por favor, adquira um plano.');
    }

    const planFeatures = plan.features;
    if (!planFeatures.allowUserAgentCreation) {
      throw new Error('Seu plano não permite a criação/edição de agentes de IA personalizados.');
    }

    const agent = await Agent.findByPk(agentId);
    if (!agent || agent.createdByUserId !== userId || agent.isSystemAgent) {
      throw new Error('Agente não encontrado ou você não tem permissão para editá-lo.');
    }

    // Previne que o usuário mude campos sensíveis ou que não deveriam ser alterados
    delete updateData.isSystemAgent;
    delete updateData.createdByUserId;
    // delete updateData.requiresUserOpenAiToken; // Se quiser que ele não possa mudar isso

    const [updatedRows] = await Agent.update(updateData, {
      where: { id: agentId, createdByUserId: userId, isSystemAgent: false },
    });

    if (updatedRows === 0) {
      throw new Error('Nenhum dado para atualizar ou agente não encontrado/pertencente ao usuário.');
    }
    return await Agent.findByPk(agentId);
  },

  /**
   * Permite ao usuário deletar seu próprio agente de IA.
   * @param {string} agentId - ID do agente a ser deletado.
   * @param {string} userId - ID do usuário criador.
   */
  async deleteUserAgent(agentId, userId) {
    const user = await User.findByPk(userId, {
      include: [{ model: Plan, as: 'currentPlan' }],
    });

    if (!user) throw new Error('Usuário não encontrado.');
    const plan = user.currentPlan;
    if (!plan || user.planExpiresAt < new Date()) {
      throw new Error('Você não tem um plano ativo. Por favor, adquira um plano.');
    }

    const planFeatures = plan.features;
    if (!planFeatures.allowUserAgentCreation) {
      throw new Error('Seu plano não permite a exclusão de agentes de IA personalizados.');
    }

    const deletedRows = await Agent.destroy({
      where: { id: agentId, createdByUserId: userId, isSystemAgent: false },
    });

    if (deletedRows === 0) {
      throw new Error('Agente não encontrado ou você não tem permissão para deletá-lo.');
    }
    return { message: 'Agente excluído com sucesso.' };
  },

  /**
   * Permite ao usuário atualizar sua chave da OpenAI.
   * @param {string} userId - ID do usuário.
   * @param {string} apiKey - A nova chave da OpenAI.
   */
  
  

  /**
   * Permite ao usuário remover sua chave da OpenAI.
   * @param {string} userId - ID do usuário.
   */


/**
   * Permite ao usuário criar seu próprio agente de IA.
   * @param {string} userId - ID do usuário criador.
   * @param {object} agentData - Dados do agente (name, description, promptTemplate, outputFormat, modelUsed, requiresUserOpenAiToken).
   * @returns {object} O agente criado.
   */
  async createUserAgent(userId, agentData) {
    const user = await User.findByPk(userId, {
      include: [{ model: Plan, as: 'currentPlan' }],
    });

    if (!user) throw new Error('Usuário não encontrado.');
    const plan = user.currentPlan;
    if (!plan || user.planExpiresAt < new Date()) {
      throw new Error('Você não tem um plano ativo. Por favor, adquira um plano.');
    }

    const planFeatures = plan.features;
    if (!planFeatures.allowUserAgentCreation) {
      throw new Error('Seu plano não permite a criação de agentes de IA personalizados.');
    }

    // --- Lógica de Limite de Criação de Agentes ---
    const maxAgents = planFeatures.maxUserAgents;
    const resetPeriod = planFeatures.userAgentCreationResetPeriod;
    let currentUserAgentsCount = user.userAgentsCreatedCount;
    let lastResetDate = user.lastAgentCreationResetDate;

    // Verifica se é hora de resetar a contagem de agentes criados
    if (resetPeriod && resetPeriod !== 'never' && lastResetDate) {
      let nextResetDate = new Date(lastResetDate);
      if (resetPeriod === 'monthly') {
        nextResetDate.setMonth(nextResetDate.getMonth() + 1);
      } else if (resetPeriod === 'yearly') {
        nextResetDate.setFullYear(nextResetDate.getFullYear() + 1);
      }

      if (new Date() >= nextResetDate) {
        currentUserAgentsCount = 0; // Reseta a contagem
        lastResetDate = new Date(); // Atualiza a data do último reset
        await user.update({ userAgentsCreatedCount: 0, lastAgentCreationResetDate: lastResetDate });
        console.log(`Contagem de agentes criados para ${user.email} resetada.`);
      }
    }

    // Verifica se o limite foi atingido APÓS o possível reset
    if (maxAgents !== -1 && currentUserAgentsCount >= maxAgents) {
      throw new Error(`Limite de ${maxAgents} agentes de IA personalizados atingido para o seu plano.`);
    }
    // --- Fim da Lógica de Limite ---

    // Garante que é um agente do usuário e que o criador é o usuário logado
    agentData.isSystemAgent = false;
    agentData.createdByUserId = userId;

    // Agentes do usuário sempre usam o token do usuário para a chamada de API
    // A propriedade `requiresUserOpenAiToken` no modelo `Agent` pode ser usada
    // para indicar se o agente *sempre* exige o token do usuário, mesmo que o plano
    // permita o token do sistema para agentes do sistema. Para agentes criados por usuários,
    // é mais seguro e lógico que eles sempre usem o token do próprio usuário.
    // Vamos forçar isso aqui para evitar confusão.
    agentData.requiresUserOpenAiToken = true;


    const newAgent = await Agent.create(agentData);

    // Incrementa a contagem de agentes criados e atualiza a data do último reset se for a primeira criação no período
    const updateFields = { userAgentsCreatedCount: currentUserAgentsCount + 1 };
    if (!user.lastAgentCreationResetDate || (resetPeriod && new Date() >= new Date(user.lastAgentCreationResetDate).setMonth(new Date(user.lastAgentCreationResetDate).getMonth() + (resetPeriod === 'monthly' ? 1 : 12)))) {
       updateFields.lastAgentCreationResetDate = lastResetDate || new Date(); // Garante que a data é setada/atualizada
    }
    await user.update(updateFields);

    return newAgent;
  },


};

module.exports = agentService;