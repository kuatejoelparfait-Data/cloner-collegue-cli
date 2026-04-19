/**
 * Classe de base pour tous les providers IA
 */

export class BaseProvider {
  constructor(options = {}) {
    this.model = options.model || this.defaultModel;
    this.apiKey = options.apiKey || null;
  }

  get name() {
    throw new Error('Le provider doit implementer get name()');
  }

  get defaultModel() {
    throw new Error('Le provider doit implementer get defaultModel()');
  }

  /**
   * Envoie un message au modele et retourne la reponse
   * @param {string} systemPrompt - Instructions systeme
   * @param {string} userMessage - Message utilisateur
   * @param {object} options - Options supplementaires (temperature, max_tokens)
   * @returns {Promise<string>} Reponse du modele
   */
  async complete(systemPrompt, userMessage, options = {}) {
    throw new Error('Le provider doit implementer complete()');
  }

  /**
   * Envoie une conversation multi-tours
   * @param {string} systemPrompt - Instructions systeme
   * @param {Array<{role: string, content: string}>} messages - Historique
   * @param {object} options
   * @returns {Promise<string>}
   */
  async chat(systemPrompt, messages, options = {}) {
    throw new Error('Le provider doit implementer chat()');
  }

  /**
   * Stream de reponse — yield des chunks de texte au fur et a mesure
   * @param {string} systemPrompt - Instructions systeme
   * @param {Array<{role: string, content: string}>} messages - Historique
   * @param {object} options
   * @yields {string} Chunks de texte
   */
  async *stream(systemPrompt, messages, options = {}) {
    throw new Error('Le provider doit implementer stream()');
  }

  /**
   * Stream complet — appelle onChunk pour chaque morceau, retourne le texte final
   * @param {string} systemPrompt - Instructions systeme
   * @param {string} userMessage - Message utilisateur
   * @param {object} options
   * @param {function} [onChunk] - Callback optionnel appele avec chaque chunk de texte
   * @returns {Promise<string>} Texte complet
   */
  async completeStream(systemPrompt, userMessage, options = {}, onChunk) {
    const messages = [{ role: 'user', content: userMessage }];
    let fullText = '';

    for await (const chunk of this.stream(systemPrompt, messages, options)) {
      fullText += chunk;
      if (onChunk) {
        onChunk(chunk);
      }
    }

    return fullText;
  }

  /**
   * Extrait le texte d'une reponse API de maniere securisee
   * Fonctionne pour les formats Anthropic et OpenAI-compatible
   */
  static safeExtractText(response, format = 'openai') {
    if (format === 'anthropic') {
      return response?.content?.[0]?.text || '';
    }
    return response?.choices?.[0]?.message?.content || '';
  }

  /**
   * Gestion centralisee des erreurs API
   * @param {Error} error - L'erreur attrapee
   * @param {string} providerName - Nom du provider pour les messages
   * @returns {never} Lance toujours une erreur avec un message clair
   */
  static handleApiError(error, providerName) {
    // Erreur deja formatee par un handler specifique (ex: Ollama ECONNREFUSED)
    if (error._handled) {
      throw error;
    }

    const status = error?.status || error?.statusCode || error?.response?.status;

    if (status === 401) {
      throw new Error(`Cle API invalide ou expiree pour ${providerName}.`);
    }

    if (status === 429) {
      // Le retry est gere par le code appelant si necessaire
      throw Object.assign(
        new Error(`Trop de requetes, attends quelques secondes (${providerName}).`),
        { retryable: true }
      );
    }

    if (status === 500 || status === 503) {
      throw new Error(`Serveur ${providerName} indisponible (${status}).`);
    }

    // Erreurs reseau
    const code = error?.code || error?.cause?.code;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT'
        || code === 'ECONNRESET' || code === 'UND_ERR_CONNECT_TIMEOUT'
        || error?.message?.includes('fetch failed')) {
      throw new Error(`Impossible de contacter ${providerName}. Verifie ta connexion.`);
    }

    // Erreur inconnue : on la relance telle quelle
    throw error;
  }
}
